import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import crypto from 'crypto'
import { getConfig } from '../config/index'
import { openclawChatAbort, openclawChatHistory, openclawChatSend, openclawConnect, openclawOnEvent, openclawRpc } from '../providers/openclaw-rpc'
import { createLogger } from '../logger'
import type { SSEEvent } from '../types/index'

const log = createLogger('Chat')
const TOOL_EVENT_CAPS = ['tool-events']

export const chatRoutes = new Hono()

function getToolCallId(data: any): string {
  return data?.id || data?.toolCallId || data?.tool_use_id || `tool-${Date.now()}`
}

function getToolResult(data: any): unknown {
  return data?.result ?? data?.partialResult ?? data?.content ?? data?.output ?? ''
}

// POST /api/chat - SSE streaming chat via OpenClaw gateway
chatRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { sessionKey, prompt, thinking } = body

  if (!prompt) return c.json({ error: 'prompt is required' }, 400)

  const config = getConfig()
  const gatewayUrl = config.providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
  const thinkingLevel = thinking || 'off'
  const resolvedSessionKey = sessionKey || `agent:main:${crypto.randomUUID()}`

  return streamSSE(c, async (stream) => {
    const sendEvent = async (event: SSEEvent) => {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: Date.now().toString(),
      })
    }

    let unsubscribe: () => void = () => {}
    let timeout: ReturnType<typeof setTimeout> | null = null
    let originalVerboseLevel: string | null = null
    let shouldRestoreVerboseLevel = false

    try {
      log.info(`Chat: session=${resolvedSessionKey}, message=${prompt.substring(0, 50)}...`)

      let fullText = ''
      let runId = ''
      let finished = false
      let streamDone: () => void
      let hasStreamedReasoning = false
      const streamedToolCallIds = new Set<string>()
      const pendingEvents: Array<{ type: string; payload: any }> = []

      const donePromise = new Promise<void>((resolve) => { streamDone = resolve })

      await openclawConnect(gatewayUrl, { caps: TOOL_EVENT_CAPS })
      try {
        const historyState = await openclawChatHistory(gatewayUrl, resolvedSessionKey, 1)
        originalVerboseLevel = typeof historyState?.verboseLevel === 'string' ? historyState.verboseLevel : null
      } catch (e: any) {
        log.info(`Failed to read session verbose level: ${e.message}`)
      }

      if (originalVerboseLevel !== 'full') {
        await openclawRpc(gatewayUrl, 'sessions.patch', {
          key: resolvedSessionKey,
          verboseLevel: 'full',
        })
        shouldRestoreVerboseLevel = true
        // sessions.patch can trigger a reconnect; reassert tool-events after it.
        await openclawConnect(gatewayUrl, { caps: TOOL_EVENT_CAPS })
      }

      const sendMissingBlocksFromHistory = async () => {
        try {
          const history = await openclawChatHistory(gatewayUrl, resolvedSessionKey, 10)
          const messages = history?.messages || []
          log.info(`History: ${messages.length} messages`)

          let lastUserIdx = -1
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              lastUserIdx = i
              break
            }
          }
          if (lastUserIdx < 0) return

          const toolResultMap = new Map<string, string>()
          for (let i = lastUserIdx + 1; i < messages.length; i++) {
            const m = messages[i]
            if (m.role === 'toolResult' && i > 0) {
              const prev = messages[i - 1]
              if (prev.role === 'assistant' && Array.isArray(prev.content)) {
                for (const block of prev.content) {
                  if (block.type === 'toolCall' || block.type === 'tool_use') {
                    const toolCallId = block.id || block.toolCallId || ''
                    if (!toolCallId) continue
                    const trContent = m.content
                    const result = Array.isArray(trContent)
                      ? trContent.map((item: any) => item.text || '').join('')
                      : typeof trContent === 'string' ? trContent : ''
                    toolResultMap.set(toolCallId, result)
                  }
                }
              }
            }
          }

          for (let i = lastUserIdx + 1; i < messages.length; i++) {
            const m = messages[i]
            if (m.role === 'assistant' && Array.isArray(m.content)) {
              for (const block of m.content) {
                if (block.type === 'thinking' && block.thinking?.trim() && !hasStreamedReasoning) {
                  await sendEvent({ type: 'reasoning', content: block.thinking })
                }
                if ((block.type === 'toolCall' || block.type === 'tool_use') && !streamedToolCallIds.has(block.id || block.toolCallId || '')) {
                  const toolCallId = block.id || block.toolCallId || `tool-${Date.now()}`
                  const toolName = block.name || block.toolName || 'tool'
                  const args = block.arguments || block.input || block.args || {}
                  await sendEvent({ type: 'tool_start', name: toolName, toolCallId, data: args })
                  await sendEvent({ type: 'tool_end', name: toolName, toolCallId, result: toolResultMap.get(toolCallId) || '' })
                }
              }
            }
          }
        } catch (e: any) {
          log.info(`Failed to fetch history: ${e.message}`)
        }
      }

      const finishStream = async () => {
        if (finished) return
        finished = true
        await sendMissingBlocksFromHistory()
        await sendEvent({ type: 'done' })
        streamDone()
      }

      const handleEvent = async (event: { type: string; payload: any }) => {
        const payload = event.payload
        const streamName = payload?.stream
        const isVerbose = event.type === 'agent' && (streamName === 'assistant' || streamName === 'thinking' || streamName === 'reasoning')
        if (isVerbose) {
          log.debug(`Event: type=${event.type}, stream=${streamName}, runId=${payload?.runId}`)
        } else {
          log.info(`Event: type=${event.type}, stream=${streamName}, phase=${payload?.data?.phase}, state=${payload?.state}, runId=${payload?.runId}`)
        }

        if (event.type === 'agent') {
          if (streamName === 'assistant') {
            if (payload.data?.delta) {
              fullText += payload.data.delta
              await sendEvent({ type: 'text', content: payload.data.delta })
            }
            if (Array.isArray(payload.data?.content)) {
              for (const block of payload.data.content) {
                if (block.type === 'tool_use' || block.type === 'toolCall') {
                  const toolCallId = block.id || block.toolCallId || `tool-${Date.now()}`
                  const toolName = block.name || block.toolName || 'tool'
                  streamedToolCallIds.add(toolCallId)
                  await sendEvent({ type: 'tool_start', name: toolName, toolCallId, data: block.input || block.arguments || block.args || {} })
                }
              }
            }
            return
          }

          if ((streamName === 'thinking' || streamName === 'reasoning') && payload.data?.delta) {
            hasStreamedReasoning = true
            await sendEvent({ type: 'reasoning', content: payload.data.delta })
            return
          }

          if (streamName === 'tool' || streamName === 'tool_call' || streamName === 'tool_use') {
            const phase = payload.data?.phase
            const toolCallId = getToolCallId(payload.data)
            const toolName = payload.data?.name || payload.data?.toolName || 'tool'

            if (phase === 'result' || phase === 'end') {
              await sendEvent({
                type: 'tool_end',
                name: toolName,
                toolCallId,
                result: getToolResult(payload.data),
                error: !!payload.data?.isError,
              })
              return
            }

            if (phase === 'update') {
              await sendEvent({
                type: 'tool_update',
                name: toolName,
                toolCallId,
                result: getToolResult(payload.data),
              })
              return
            }

            streamedToolCallIds.add(toolCallId)
            await sendEvent({
              type: 'tool_start',
              name: toolName,
              toolCallId,
              data: payload.data?.input || payload.data?.arguments || payload.data?.args || {},
            })
            return
          }

          if (streamName === 'tool_result' || streamName === 'tool_end') {
            const toolCallId = getToolCallId(payload.data)
            const toolName = payload.data?.name || payload.data?.toolName || 'tool'
            await sendEvent({
              type: 'tool_end',
              name: toolName,
              toolCallId,
              result: getToolResult(payload.data),
              error: !!payload.data?.isError,
            })
            return
          }

          if (streamName === 'lifecycle') {
            if (payload.data?.phase === 'end') {
              await finishStream()
              return
            }
            if (payload.data?.phase === 'error') {
              await sendEvent({ type: 'error', message: payload.data?.error || 'Agent error' })
              streamDone()
              return
            }
          }

          if (streamName === 'error') {
            await sendEvent({ type: 'error', message: payload.data?.reason || 'Agent error' })
            streamDone()
          }
          return
        }

        if (event.type === 'chat' && payload.state === 'final') {
          const text = payload.message?.content
            ?.filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('') || ''
          if (text && !fullText) {
            await sendEvent({ type: 'text', content: text })
          }
          await finishStream()
        }
      }

      unsubscribe = openclawOnEvent(async (event) => {
        const eventRunId = event.payload?.runId
        if (!runId) {
          pendingEvents.push(event)
          return
        }
        if (eventRunId && eventRunId !== runId) return
        await handleEvent(event)
      })

      const result = await openclawChatSend(gatewayUrl, resolvedSessionKey, prompt, thinkingLevel)
      runId = result.runId
      log.debug(`Chat started: runId=${runId}`)

      for (const event of pendingEvents) {
        const eventRunId = event.payload?.runId
        if (!eventRunId || eventRunId === runId) {
          await handleEvent(event)
        }
      }
      pendingEvents.length = 0

      timeout = setTimeout(() => { streamDone() }, 120000)
      await donePromise
    } catch (error) {
      log.error(`Chat error: ${error instanceof Error ? error.message : error}`)
      await sendEvent({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
      unsubscribe()
      if (shouldRestoreVerboseLevel) {
        try {
          await openclawRpc(gatewayUrl, 'sessions.patch', {
            key: resolvedSessionKey,
            verboseLevel: originalVerboseLevel,
          })
        } catch (e: any) {
          log.info(`Failed to restore verbose level: ${e.message}`)
        }
      }
    }
  })
})

// POST /api/chat/abort/:runId - Abort running chat
chatRoutes.post('/abort/:runId', async (c) => {
  const runId = c.req.param('runId')
  const config = getConfig()
  const gatewayUrl = config.providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
  try {
    await openclawChatAbort(gatewayUrl, runId)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Abort failed' }, 500)
  }
})
