import { create } from 'zustand'
import { openclawApi, toolsApi } from '@/services/api'
import type { Message, Conversation, ContextUsage, ToolCallData, MessageBlock } from '@/types'

type ToolCallSummaryMap = Record<string, { summary: string; toolName?: string; updatedAt: number }>

function parseOpenclawMessages(rawMessages: any[], sessionKey: string, summaryMap: ToolCallSummaryMap = {}): Message[] {
  const result: Message[] = []

  // Build tool result map: toolResult messages follow the assistant message with toolCall
  // Gateway format: role=toolResult with content=[{type:"text", text:"..."}]
  // Also support classic format: tool_result blocks with tool_use_id inside messages
  const toolResultMap = new Map<string, string>()

  for (let i = 0; i < rawMessages.length; i++) {
    const m = rawMessages[i]
    // Classic format: tool_result blocks inside messages
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const val = block.content || block.text || ''
          toolResultMap.set(block.tool_use_id, typeof val === 'string' ? val : JSON.stringify(val))
        }
      }
    }
    // Gateway format: role=toolResult follows assistant with toolCall
    if (m.role === 'toolResult' && i > 0) {
      const prev = rawMessages[i - 1]
      if (prev.role === 'assistant' && Array.isArray(prev.content)) {
        for (const block of prev.content) {
          if (block.type === 'toolCall' || block.type === 'tool_use') {
            const toolCallId = block.id || block.toolCallId || ''
            if (toolCallId) {
              const trContent = m.content
              const val = Array.isArray(trContent)
                ? trContent.map((c: any) => c.text || '').join('')
                : typeof trContent === 'string' ? trContent : ''
              toolResultMap.set(toolCallId, val)
            }
          }
        }
      }
    }
  }

  for (const m of rawMessages) {
    const ts = m.timestamp ? new Date(m.timestamp).getTime() || Date.now() : Date.now()

    if (m.role === 'user') {
      const content = Array.isArray(m.content)
        ? m.content.map((c: any) => c.text || '').join('')
        : String(m.content || '')
      result.push({
        id: `${sessionKey}-${ts}-user-${result.length}`,
        role: 'user',
        blocks: [{ type: 'text', content }],
        timestamp: ts,
      })
    } else if (m.role === 'assistant' && Array.isArray(m.content)) {
      const blocks: MessageBlock[] = []
      for (const block of m.content) {
        if (block.type === 'text' && block.text?.trim()) {
          blocks.push({ type: 'text', content: block.text })
        } else if (block.type === 'thinking' && block.thinking?.trim()) {
          blocks.push({ type: 'reasoning', content: block.thinking })
        } else if (block.type === 'tool_use' || block.type === 'toolCall') {
          const toolCallId = block.id || block.toolCallId || `tool-${ts}-${blocks.length}`
          const toolName = block.name || block.toolName || 'tool'
          const storedSummary = summaryMap[toolCallId]
          blocks.push({
            type: 'tool_call',
            data: {
              toolName, toolCallId,
              args: block.arguments || block.input || block.args || {},
              result: toolResultMap.get(toolCallId),
              summary: storedSummary?.summary,
              summaryStatus: storedSummary?.summary ? 'ready' : undefined,
              status: 'completed',
            },
          })
        }
      }
      if (blocks.length > 0) {
        result.push({ id: `${sessionKey}-${ts}-asst-${result.length}`, role: 'assistant', blocks, timestamp: ts })
      }
    } else if (m.role === 'assistant') {
      const content = String(m.content || '')
      if (content.trim()) {
        result.push({ id: `${sessionKey}-${ts}-asst-${result.length}`, role: 'assistant', blocks: [{ type: 'text', content }], timestamp: ts })
      }
    }
  }
  return result
}

interface ChatState {
  conversations: Conversation[]
  currentConversationId: string | null
  streamingConversationIds: string[]
  unreadCounts: Record<string, number>
  contextUsage: ContextUsage

  addConversation: (conv: Conversation) => void
  setCurrentConversation: (id: string | null) => void
  getCurrentConversation: () => Conversation | undefined
  openOpenclawSession: (sessionKey: string, gatewayUrl: string, title?: string) => Promise<string>
  addMessage: (convId: string, msg: Message) => void
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void
  appendTextBlock: (convId: string, msgId: string, delta: string) => void
  appendReasoningBlock: (convId: string, msgId: string, delta: string) => void
  addToolCallBlock: (convId: string, msgId: string, tc: ToolCallData) => void
  updateToolCallBlock: (convId: string, msgId: string, toolCallId: string, updates: Partial<ToolCallData>) => void
  replaceMessageBlocks: (convId: string, msgId: string, blocks: MessageBlock[]) => void
  setConversationStreaming: (convId: string, streaming: boolean) => void
  isConversationStreaming: (convId: string) => boolean
  incrementUnread: (convId: string) => void
  clearUnread: (convId: string) => void
  deleteConversation: (convId: string) => void
  updateConversationTitle: (convId: string, title: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  streamingConversationIds: [],
  unreadCounts: {},
  contextUsage: { currentTokens: 0, maxTokens: 200000, usageRatio: 0 },

  addConversation: (conv) => set(s => ({ conversations: [conv, ...s.conversations] })),

  setCurrentConversation: (id) => set(s => {
    if (!id) return { currentConversationId: null }
    const { [id]: _, ...restUnread } = s.unreadCounts
    return { currentConversationId: id, unreadCounts: restUnread }
  }),

  getCurrentConversation: () => {
    const { conversations, currentConversationId } = get()
    return conversations.find(c => c.id === currentConversationId)
  },

  openOpenclawSession: async (sessionKey, gatewayUrl, title) => {
    const { conversations } = get()
    const existing = conversations.find(c => c.id === sessionKey)
    if (existing) { set({ currentConversationId: sessionKey }); return sessionKey }

    try {
      const [data, summaryData] = await Promise.all([
        openclawApi.history(gatewayUrl, sessionKey),
        toolsApi.getSummaries(sessionKey).catch(() => ({ summaries: {} })),
      ])
      const messages: Message[] = (data.ok && Array.isArray(data.messages))
        ? parseOpenclawMessages(data.messages, sessionKey, summaryData.summaries || {}) : []
      const now = Date.now()
      const conv: Conversation = {
        id: sessionKey,
        title: title || (messages.length > 0
          ? (messages[0].blocks.find(b => b.type === 'text') as any)?.content?.slice(0, 50) || `Chat ${sessionKey.slice(0, 8)}`
          : `Chat ${sessionKey.slice(0, 8)}`),
        messages, createdAt: messages[0]?.timestamp || now, updatedAt: messages[messages.length - 1]?.timestamp || now,
        source: 'openclaw',
      }
      set(s => ({ conversations: [conv, ...s.conversations], currentConversationId: sessionKey }))
      return sessionKey
    } catch {
      const conv: Conversation = { id: sessionKey, title: title || `Chat ${sessionKey.slice(0, 8)}`, messages: [], createdAt: Date.now(), updatedAt: Date.now(), source: 'openclaw' }
      set(s => ({ conversations: [conv, ...s.conversations], currentConversationId: sessionKey }))
      return sessionKey
    }
  },

  addMessage: (convId, msg) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() } : c),
  })),

  updateMessage: (convId, msgId, updates) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => m.id === msgId ? { ...m, ...updates } : m),
    } : c),
  })),

  appendTextBlock: (convId, msgId, delta) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => {
        if (m.id !== msgId) return m
        const blocks = [...m.blocks]
        const last = blocks[blocks.length - 1]
        if (last?.type === 'text') { blocks[blocks.length - 1] = { type: 'text', content: last.content + delta } }
        else { blocks.push({ type: 'text', content: delta }) }
        return { ...m, blocks }
      }),
    } : c),
  })),

  appendReasoningBlock: (convId, msgId, delta) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => {
        if (m.id !== msgId) return m
        const blocks = [...m.blocks]
        // Find existing reasoning block to extend
        const reasoningIdx = blocks.findIndex(b => b.type === 'reasoning')
        if (reasoningIdx >= 0) {
          blocks[reasoningIdx] = { type: 'reasoning', content: (blocks[reasoningIdx] as any).content + delta }
        } else {
          // Insert reasoning at the beginning (before text blocks)
          blocks.unshift({ type: 'reasoning', content: delta })
        }
        return { ...m, blocks }
      }),
    } : c),
  })),

  addToolCallBlock: (convId, msgId, tc) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => {
        if (m.id !== msgId) return m
        const blocks = [...m.blocks]
        const existingIdx = blocks.findIndex(block => block.type === 'tool_call' && block.data.toolCallId === tc.toolCallId)
        if (existingIdx >= 0) {
          const existing = blocks[existingIdx] as Extract<MessageBlock, { type: 'tool_call' }>
          blocks[existingIdx] = { type: 'tool_call', data: { ...existing.data, ...tc } }
        } else {
          blocks.push({ type: 'tool_call', data: tc })
        }
        return { ...m, blocks }
      }),
    } : c),
  })),

  updateToolCallBlock: (convId, msgId, toolCallId, updates) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => {
        if (m.id !== msgId) return m
        const blocks = [...m.blocks]
        const existingIdx = blocks.findIndex(block => block.type === 'tool_call' && block.data.toolCallId === toolCallId)
        if (existingIdx >= 0) {
          const existing = blocks[existingIdx] as Extract<MessageBlock, { type: 'tool_call' }>
          blocks[existingIdx] = { type: 'tool_call', data: { ...existing.data, ...updates } }
        } else {
          blocks.push({
            type: 'tool_call',
            data: {
              toolName: typeof updates.toolName === 'string' ? updates.toolName : 'tool',
              toolCallId,
              args: {},
              status: updates.status || 'running',
              ...updates,
            },
          })
        }
        return { ...m, blocks }
      }),
    } : c),
  })),

  replaceMessageBlocks: (convId, msgId, blocks) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? {
      ...c,
      updatedAt: Date.now(),
      messages: c.messages.map(m => m.id === msgId ? { ...m, blocks } : m),
    } : c),
  })),

  setConversationStreaming: (convId, streaming) => set(s => ({
    streamingConversationIds: streaming
      ? [...s.streamingConversationIds.filter(id => id !== convId), convId]
      : s.streamingConversationIds.filter(id => id !== convId),
  })),

  isConversationStreaming: (convId) => get().streamingConversationIds.includes(convId),

  incrementUnread: (convId) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [convId]: (s.unreadCounts[convId] || 0) + 1 },
  })),

  clearUnread: (convId) => set(s => {
    const { [convId]: _, ...rest } = s.unreadCounts
    return { unreadCounts: rest }
  }),

  deleteConversation: (convId) => set(s => ({
    conversations: s.conversations.filter(c => c.id !== convId),
    currentConversationId: s.currentConversationId === convId ? null : s.currentConversationId,
  })),

  updateConversationTitle: (convId, title) => set(s => ({
    conversations: s.conversations.map(c => c.id === convId ? { ...c, title } : c),
  })),

}))
