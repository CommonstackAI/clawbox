function tryParseJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!['{', '[', '"'].includes(trimmed[0])) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return tryParseJson(value)
  }
  return value
}

function extractText(value: unknown): string {
  if (!value) return ''

  if (typeof value === 'string') {
    return value.trim()
  }

  if (Array.isArray(value)) {
    return value
      .map(item => extractText(item))
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  if (typeof value !== 'object') {
    return ''
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(record.content)) {
    const contentText = record.content
      .map((item: any) => {
        if (typeof item?.text === 'string') return item.text
        return extractText(item)
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    if (contentText) return contentText
  }

  if (record.details && typeof record.details === 'object') {
    const details = record.details as Record<string, unknown>
    if (typeof details.aggregated === 'string' && details.aggregated.trim()) {
      return details.aggregated.trim()
    }
    if (typeof details.tail === 'string' && details.tail.trim()) {
      return details.tail.trim()
    }
  }

  return ''
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatToolArgs(args: unknown): string {
  const normalized = normalizeValue(args)
  if (
    normalized &&
    typeof normalized === 'object' &&
    !Array.isArray(normalized) &&
    Object.keys(normalized as Record<string, unknown>).length === 0
  ) {
    return '{}'
  }
  const rendered = stringifyValue(normalized)
  return rendered || '{}'
}

export function formatToolResult(result: unknown): string {
  const normalized = normalizeValue(result)
  const text = extractText(normalized)
  if (text) return text
  return stringifyValue(normalized)
}

function toSingleLine(value: unknown): string {
  if (value === undefined || value === null) return ''
  const rendered = typeof value === 'string' ? value : stringifyValue(value)
  return rendered.replace(/\s+/g, ' ').trim()
}

export function summarizeToolCall(params: {
  toolName: string
  args: unknown
  summary?: string
  summaryStatus?: 'pending' | 'ready' | 'failed'
  pendingLabel?: string
}): string {
  if (params.summaryStatus === 'pending') {
    return params.pendingLabel || 'Using tool'
  }

  if (params.summary?.trim()) return params.summary.trim()

  const toolName = params.toolName || 'tool'
  const args = normalizeValue(params.args)

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return toolName
  }

  const record = args as Record<string, unknown>
  const preferredKeys = ['command', 'query', 'path', 'url', 'prompt', 'text', 'message']

  for (const key of preferredKeys) {
    if (key in record) {
      const value = toSingleLine(record[key])
      if (value) return `${toolName}: ${value}`
    }
  }

  const firstEntry = Object.entries(record)[0]
  if (!firstEntry) return toolName

  const [, firstValue] = firstEntry
  const text = toSingleLine(firstValue)
  return text ? `${toolName}: ${text}` : toolName
}
