import { GATEWAY_URL } from './api'
import { formatToolResult } from '@/lib/tool-call-display'

export interface ChatRequest {
  sessionKey: string
  prompt: string
  thinking?: string
}

export interface ChatCallbacks {
  onText: (content: string) => void
  onReasoning: (content: string) => void
  onToolStart: (data: { name: string; toolCallId: string; args: Record<string, any> }) => void
  onToolUpdate: (data: { toolCallId: string; name?: string; result: string }) => void
  onToolEnd: (data: { toolCallId: string; name?: string; result: string; error?: boolean }) => void
  onDone: (metadata?: any) => void
  onError: (error: string) => void
}

export async function streamChat(request: ChatRequest, callbacks: ChatCallbacks): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!res.ok) {
    const text = await res.text()
    callbacks.onError(text || 'Chat request failed')
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { callbacks.onError('No response stream'); return }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data) continue

      try {
        const event = JSON.parse(data)
        switch (event.type) {
          case 'text':
            callbacks.onText(event.content || '')
            break
          case 'reasoning':
            callbacks.onReasoning(event.content || '')
            break
          case 'tool_start':
            callbacks.onToolStart({
              name: event.name || 'tool',
              toolCallId: event.toolCallId || `tool-${Date.now()}`,
              args: event.data || {},
            })
            break
          case 'tool_update':
            callbacks.onToolUpdate({
              toolCallId: event.toolCallId || '',
              name: event.name,
              result: formatToolResult(event.result),
            })
            break
          case 'tool_end':
            callbacks.onToolEnd({
              toolCallId: event.toolCallId || '',
              name: event.name,
              result: formatToolResult(event.result),
              error: !!event.error,
            })
            break
          case 'done':
            callbacks.onDone(event.metadata)
            break
          case 'error':
            callbacks.onError(event.message || 'Unknown error')
            break
        }
      } catch {}
    }
  }
}

export async function abortChat(runId: string): Promise<void> {
  try {
    await fetch(`${GATEWAY_URL}/api/chat/abort/${runId}`, { method: 'POST' })
  } catch {}
}
