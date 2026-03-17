import { useCallback } from 'react'
import { nanoid } from 'nanoid'
import { useChatStore } from '@/store/chat'
import { useSessionStore } from '@/store/sessions'
import { useSettingsStore } from '@/store/settings'
import { useTitleStore } from '@/store/titles'
import { streamChat, abortChat } from '@/services/ai'
import { toolsApi } from '@/services/api'
import type { Message } from '@/types'

export function useChat() {
  const chatStore = useChatStore()
  const sessionStore = useSessionStore()
  const settingsStore = useSettingsStore()

  const handleSend = useCallback(async (prompt: string, thinking?: string) => {
    let convId = chatStore.currentConversationId
    const isNewConversation = !convId

    // Create new conversation if needed
    if (!convId) {
      convId = `agent:main:${nanoid()}`
      chatStore.addConversation({
        id: convId,
        title: prompt.slice(0, 50),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        source: 'openclaw',
      })
      chatStore.setCurrentConversation(convId)
      sessionStore.setCurrentSession(convId)
    }

    // Add user message
    const userMsg: Message = {
      id: nanoid(),
      role: 'user',
      blocks: [{ type: 'text', content: prompt }],
      timestamp: Date.now(),
    }
    chatStore.addMessage(convId, userMsg)

    // Add assistant placeholder
    const assistantId = nanoid()
    chatStore.addMessage(convId, {
      id: assistantId,
      role: 'assistant',
      blocks: [],
      timestamp: Date.now(),
      isLoading: true,
    })
    chatStore.setConversationStreaming(convId, true)

    const finalConvId = convId

    try {
      // Apply pending model switch before streaming (gateway restart happens here)
      if (settingsStore.pendingModel) {
        await settingsStore.applyPendingModel()
      }

      await streamChat(
        { sessionKey: convId, prompt, thinking: thinking || 'off' },
        {
          onText: (content) => chatStore.appendTextBlock(finalConvId, assistantId, content),
          onReasoning: (content) => chatStore.appendReasoningBlock(finalConvId, assistantId, content),
          onToolStart: (data) => {
            chatStore.addToolCallBlock(finalConvId, assistantId, {
              toolName: data.name,
              toolCallId: data.toolCallId,
              args: data.args || {},
              summaryStatus: 'pending',
              status: 'running',
            })

            toolsApi.generateSummary(data.name, data.args || {})
              .then((res) => {
                const summary = res.summary?.trim()
                if (summary) {
                  useChatStore.getState().updateToolCallBlock(finalConvId, assistantId, data.toolCallId, {
                    summary,
                    summaryStatus: 'ready',
                  })
                  toolsApi.saveSummary(finalConvId, data.toolCallId, summary, data.name).catch(() => {})
                  return
                }

                useChatStore.getState().updateToolCallBlock(finalConvId, assistantId, data.toolCallId, {
                  summaryStatus: 'failed',
                })
              })
              .catch(() => {
                useChatStore.getState().updateToolCallBlock(finalConvId, assistantId, data.toolCallId, {
                  summaryStatus: 'failed',
                })
              })
          },
          onToolUpdate: (data) => chatStore.updateToolCallBlock(finalConvId, assistantId, data.toolCallId, {
            toolName: data.name || 'tool',
            result: data.result,
            status: 'running',
          }),
          onToolEnd: (data) => chatStore.updateToolCallBlock(finalConvId, assistantId, data.toolCallId, {
            toolName: data.name || 'tool',
            result: data.result,
            status: data.error ? 'error' : 'completed',
          }),
          onDone: () => {
            chatStore.updateMessage(finalConvId, assistantId, { isLoading: false })
            chatStore.setConversationStreaming(finalConvId, false)
            if (chatStore.currentConversationId !== finalConvId) {
              chatStore.incrementUnread(finalConvId)
            }
          },
          onError: (error) => {
            chatStore.updateMessage(finalConvId, assistantId, {
              isLoading: false, error: true,
              blocks: [{ type: 'text', content: `Error: ${error}` }],
            })
            chatStore.setConversationStreaming(finalConvId, false)
          },
        },
      )
    } catch (e) {
      chatStore.updateMessage(finalConvId, assistantId, {
        isLoading: false, error: true,
        blocks: [{ type: 'text', content: `Error: ${e}` }],
      })
      chatStore.setConversationStreaming(finalConvId, false)
    } finally {
      // Ensure streaming state is cleared even if onDone didn't fire
      chatStore.updateMessage(finalConvId, assistantId, { isLoading: false })
      chatStore.setConversationStreaming(finalConvId, false)
      // Refresh session list
      await sessionStore.loadSessions()
      if (finalConvId) {
        sessionStore.setCurrentSession(finalConvId)
      }
      // Fire-and-forget title generation for new conversations
      if (isNewConversation) {
        const currentConfig = useSettingsStore.getState().config
        if (currentConfig?.providers?.openclaw?.baseUrl && currentConfig?.providers?.openclaw?.defaultModel) {
          useTitleStore.getState().generateTitle(finalConvId, prompt).then(title => {
            if (title) useChatStore.getState().updateConversationTitle(finalConvId, title)
          })
        }
      }
    }
  }, [chatStore, sessionStore, settingsStore])

  const handleAbort = useCallback(async () => {
    const sessionId = sessionStore.currentSessionId
    const convId = chatStore.currentConversationId
    if (sessionId) await abortChat(sessionId)
    if (convId) chatStore.setConversationStreaming(convId, false)
  }, [sessionStore, chatStore])

  return { handleSend, handleAbort }
}
