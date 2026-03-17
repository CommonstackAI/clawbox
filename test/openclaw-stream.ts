import crypto from 'crypto'
import { getConfig, loadConfig } from '../internal/config/index.ts'
import { openclawChatSend, openclawConnect, openclawGetClient, openclawOnEvent, openclawRpc } from '../internal/providers/openclaw-rpc.ts'

const TOOL_EVENT_CAPS = ['tool-events']

type Args = {
  prompt: string
  sessionKey: string
  thinking: string
  verboseLevel: string
  timeoutMs: number
  raw: boolean
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {
    thinking: 'off',
    verboseLevel: 'full',
    timeoutMs: 120000,
    raw: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--prompt' || arg === '-p') {
      out.prompt = argv[++i]
    } else if (arg === '--session-key' || arg === '-s') {
      out.sessionKey = argv[++i]
    } else if (arg === '--thinking' || arg === '-t') {
      out.thinking = argv[++i]
    } else if (arg === '--verbose-level') {
      out.verboseLevel = argv[++i]
    } else if (arg === '--timeout-ms') {
      out.timeoutMs = Number(argv[++i])
    } else if (arg === '--raw') {
      out.raw = true
    } else if (arg === '--help' || arg === '-h') {
      out.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return {
    prompt: out.prompt || '',
    sessionKey: out.sessionKey || `agent:main:stream-debug:${crypto.randomUUID()}`,
    thinking: out.thinking || 'off',
    verboseLevel: out.verboseLevel || 'full',
    timeoutMs: Number.isFinite(out.timeoutMs) ? Number(out.timeoutMs) : 120000,
    raw: !!out.raw,
    help: !!out.help,
  }
}

function printHelp(): void {
  console.log(`Usage:
  bun test/openclaw-stream.ts --prompt "你好"

Options:
  --prompt, -p       The prompt to send to OpenClaw
  --session-key, -s  Session key to use (default: random agent:main:stream-debug:*)
  --thinking, -t     Thinking level (default: off)
  --verbose-level    Session verbose level before send (default: full; use "inherit" to keep current)
  --timeout-ms       Exit timeout in ms (default: 120000)
  --raw              Print full raw event JSON
  --help, -h         Show this help
`)
}

function now(): string {
  return new Date().toISOString()
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function truncate(value: string, max = 220): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function extractText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map(item => extractText(item))
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.content)) {
      const fromContent = record.content
        .map((item: any) => {
          if (typeof item?.text === 'string') return item.text
          return extractText(item)
        })
        .filter(Boolean)
        .join('\n')
        .trim()
      if (fromContent) return fromContent
    }
    if (record.details && typeof record.details === 'object') {
      const details = record.details as Record<string, unknown>
      const aggregated = typeof details.aggregated === 'string' ? details.aggregated.trim() : ''
      if (aggregated) return aggregated
      const tail = typeof details.tail === 'string' ? details.tail.trim() : ''
      if (tail) return tail
    }
  }
  return ''
}

function formatDisplayValue(value: unknown, fallbackMax = 600): string {
  const text = extractText(value)
  if (text) return truncate(text, fallbackMax)
  return truncate(safeJson(value), fallbackMax)
}

function summarizeEvent(event: { type: string; payload: any }): string {
  const payload = event.payload || {}
  const stream = payload.stream || '-'
  const runId = payload.runId || '-'
  const phase = payload.data?.phase ? ` phase=${payload.data.phase}` : ''
  const state = payload.state ? ` state=${payload.state}` : ''

  if (event.type === 'chat') {
    const blocks = Array.isArray(payload.message?.content) ? payload.message.content.map((block: any) => block.type).join(',') : '-'
    return `type=chat runId=${runId}${state} blocks=${blocks}`
  }

  if (event.type !== 'agent') {
    return `type=${event.type} runId=${runId} stream=${stream}${phase}${state}`
  }

  if (stream === 'assistant') {
    const delta = payload.data?.delta
    if (delta) return `type=agent runId=${runId} stream=assistant delta=${truncate(String(delta))}`

    const content = payload.data?.content
    if (Array.isArray(content) && content.length > 0) {
      const kinds = content.map((block: any) => block.type || '?').join(',')
      const toolBlock = content.find((block: any) => block?.type === 'tool_use' || block?.type === 'toolCall')
      if (toolBlock) {
        const toolName = toolBlock.name || toolBlock.toolName || 'tool'
        const toolCallId = toolBlock.id || toolBlock.toolCallId || '-'
        const args = toolBlock.input || toolBlock.arguments || toolBlock.args || {}
        return `type=agent runId=${runId} stream=assistant blocks=${kinds} tool=${toolName} toolCallId=${toolCallId} args=${truncate(safeJson(args))}`
      }
      return `type=agent runId=${runId} stream=assistant blocks=${kinds}`
    }
  }

  if (stream === 'thinking' || stream === 'reasoning') {
    const delta = payload.data?.delta || payload.data?.thinking || payload.data?.content || ''
    return `type=agent runId=${runId} stream=${stream} delta=${truncate(String(delta))}`
  }

  if (stream === 'tool' || stream === 'tool_call' || stream === 'tool_use') {
    const toolName = payload.data?.name || payload.data?.toolName || 'tool'
    const toolCallId = payload.data?.id || payload.data?.toolCallId || '-'
    const eventPhase = payload.data?.phase || '-'

    if (eventPhase === 'start') {
      const args = payload.data?.args || payload.data?.input || payload.data?.arguments || {}
      return `type=agent runId=${runId} stream=${stream} phase=start tool=${toolName} toolCallId=${toolCallId} args=${truncate(safeJson(args))}`
    }

    if (eventPhase === 'update') {
      const partial = payload.data?.partialResult || payload.data?.delta || payload.data?.content || ''
      return `type=agent runId=${runId} stream=${stream} phase=update tool=${toolName} toolCallId=${toolCallId} partial=${truncate(typeof partial === 'string' ? partial : safeJson(partial))}`
    }

    if (eventPhase === 'result' || eventPhase === 'end') {
      const result = payload.data?.result || payload.data?.content || payload.data?.output || ''
      const isError = payload.data?.isError ? ' error=true' : ''
      return `type=agent runId=${runId} stream=${stream} phase=${eventPhase} tool=${toolName} toolCallId=${toolCallId}${isError} result=${truncate(typeof result === 'string' ? result : safeJson(result))}`
    }

    return `type=agent runId=${runId} stream=${stream}${phase} tool=${toolName} toolCallId=${toolCallId}`
  }

  if (stream === 'tool_result' || stream === 'tool_end') {
    const toolName = payload.data?.name || payload.data?.toolName || 'tool'
    const toolCallId = payload.data?.id || payload.data?.toolCallId || payload.data?.tool_use_id || '-'
    const result = payload.data?.content || payload.data?.result || payload.data?.output || ''
    return `type=agent runId=${runId} stream=${stream} tool=${toolName} toolCallId=${toolCallId} result=${truncate(typeof result === 'string' ? result : safeJson(result))}`
  }

  return `type=agent runId=${runId} stream=${stream}${phase}${state}`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.prompt) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  loadConfig()
  const gatewayUrl = getConfig().providers.openclaw.baseUrl
  const toolCalls = new Map<string, { toolName: string; args: unknown }>()
  let trailingNewlines = 0
  let renderedAssistantText = false
  let sawAssistantDelta = false

  const write = (value: string) => {
    if (!value) return
    process.stdout.write(value)
    const match = value.match(/\n+$/)
    trailingNewlines = match ? match[0].length : 0
  }

  const ensureNewlines = (count: number) => {
    if (trailingNewlines >= count) return
    write('\n'.repeat(count - trailingNewlines))
  }

  const printToolCall = (toolName: string, argsValue: unknown, resultValue: unknown) => {
    if (renderedAssistantText) {
      ensureNewlines(2)
    } else if (trailingNewlines < 1) {
      ensureNewlines(1)
    }
    write('[Tool Call]\n')
    write(`Tool: ${toolName || 'tool'}\n`)
    write(`Args: ${formatDisplayValue(argsValue)}\n`)
    write(`Result: ${formatDisplayValue(resultValue)}\n\n`)
  }

  const flushEvent = (event: { type: string; payload: any }) => {
    if (args.raw) {
      const line = summarizeEvent(event)
      console.log(`[${now()}] ${line}`)
      console.log(JSON.stringify(event, null, 2))
      return
    }

    const payload = event.payload || {}
    if (event.type === 'agent') {
      const stream = payload.stream
      const data = payload.data || {}

      if (stream === 'assistant') {
        if (typeof data.delta === 'string' && data.delta.length > 0) {
          if (!renderedAssistantText) {
            ensureNewlines(1)
            renderedAssistantText = true
          }
          sawAssistantDelta = true
          write(data.delta)
          return
        }

        const content = Array.isArray(data.content) ? data.content : []
        for (const block of content) {
          if (block?.type === 'tool_use' || block?.type === 'toolCall') {
            const toolCallId = block.id || block.toolCallId || crypto.randomUUID()
            const toolName = block.name || block.toolName || 'tool'
            toolCalls.set(toolCallId, {
              toolName,
              args: block.input || block.arguments || block.args || {},
            })
          }
        }
        return
      }

      if (stream === 'tool') {
        const phase = data.phase
        const toolCallId = data.id || data.toolCallId || crypto.randomUUID()
        const toolName = data.name || data.toolName || toolCalls.get(toolCallId)?.toolName || 'tool'

        if (phase === 'start') {
          toolCalls.set(toolCallId, {
            toolName,
            args: data.args || data.input || data.arguments || {},
          })
          return
        }

        if (phase === 'result' || phase === 'end') {
          const stored = toolCalls.get(toolCallId)
          toolCalls.delete(toolCallId)
          const argsValue = stored?.args ?? data.args ?? data.input ?? data.arguments ?? {}
          const resultValue = data.result ?? data.content ?? data.output ?? ''
          printToolCall(toolName, argsValue, resultValue)
          return
        }

        return
      }

      if (stream === 'error') {
        ensureNewlines(2)
        write(`Error: ${data.reason || 'Agent error'}\n`)
      }
      return
    }

    if (!sawAssistantDelta && event.type === 'chat' && payload.state === 'final') {
      const text = Array.isArray(payload.message?.content)
        ? payload.message.content
          .filter((block: any) => block?.type === 'text' && typeof block?.text === 'string')
          .map((block: any) => block.text)
          .join('')
        : ''
      if (text) {
        ensureNewlines(1)
        renderedAssistantText = true
        write(text)
      }
    }
  }

  const cleanup = () => {
    try {
      openclawGetClient().disconnect()
    } catch {}
  }

  if (args.raw) {
    console.log(`[${now()}] gatewayUrl=${gatewayUrl}`)
    console.log(`[${now()}] sessionKey=${args.sessionKey}`)
    console.log(`[${now()}] thinking=${args.thinking}`)
    console.log(`[${now()}] verboseLevel=${args.verboseLevel}`)
    console.log(`[${now()}] caps=${TOOL_EVENT_CAPS.join(',')}`)
    console.log(`[${now()}] prompt=${args.prompt}`)
  } else {
    console.log(`Prompt: ${args.prompt}\n`)
  }

  await openclawConnect(gatewayUrl, { caps: TOOL_EVENT_CAPS })

  if (args.verboseLevel !== 'inherit') {
    await openclawRpc(gatewayUrl, 'sessions.patch', {
      key: args.sessionKey,
      verboseLevel: args.verboseLevel,
    })
    // Reassert tool-events capability after any reconnect inside RPC helper.
    await openclawConnect(gatewayUrl, { caps: TOOL_EVENT_CAPS })
  }

  let runId = ''
  let finished = false
  const pendingEvents: Array<{ type: string; payload: any }> = []

  const maybeHandleEvent = (event: { type: string; payload: any }) => {
    const eventRunId = event.payload?.runId

    if (!runId) {
      pendingEvents.push(event)
      return
    }

    if (eventRunId && eventRunId !== runId) return
    flushEvent(event)

    if (event.type === 'agent' && event.payload?.stream === 'lifecycle' && event.payload?.data?.phase === 'end') {
      finished = true
    }
    if (event.type === 'chat' && event.payload?.state === 'final') {
      finished = true
    }
    if (event.type === 'agent' && event.payload?.stream === 'error') {
      finished = true
    }
  }

  const unsubscribe = openclawOnEvent((event) => {
    maybeHandleEvent(event)
  })

  const timeout = setTimeout(() => {
    if (!finished) {
      if (!args.raw) ensureNewlines(2)
      console.error(args.raw ? `[${now()}] timeout after ${args.timeoutMs}ms` : `Timeout after ${args.timeoutMs}ms`)
      unsubscribe()
      cleanup()
      process.exit(1)
    }
  }, args.timeoutMs)

  process.on('SIGINT', () => {
    clearTimeout(timeout)
    unsubscribe()
    cleanup()
    ensureNewlines(1)
    console.log(args.raw ? `[${now()}] interrupted` : 'Interrupted')
    process.exit(130)
  })

  try {
    const result = await openclawChatSend(gatewayUrl, args.sessionKey, args.prompt, args.thinking)
    runId = result.runId
    if (args.raw) {
      console.log(`[${now()}] runId=${runId}`)
    }

    for (const event of pendingEvents) {
      const eventRunId = event.payload?.runId
      if (!eventRunId || eventRunId === runId) {
        flushEvent(event)
      }
    }
    pendingEvents.length = 0

    while (!finished) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    clearTimeout(timeout)
    unsubscribe()
    cleanup()
    ensureNewlines(1)
  } catch (error) {
    clearTimeout(timeout)
    unsubscribe()
    cleanup()
    if (!args.raw) ensureNewlines(2)
    console.error(args.raw ? `[${now()}] failed: ${error instanceof Error ? error.message : String(error)}` : `Failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

main()
