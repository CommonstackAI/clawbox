import { Hono } from 'hono'
import { createLogger } from '../logger'
import {
  getSessionToolCallSummaries,
  setToolCallSummary,
  deleteSessionToolCallSummaries,
} from '../tool-call-summaries/index'
import { callOpenclawDefaultModelChatCompletion, getOpenclawDefaultModelTarget } from '../providers/openclaw-completions'

const toolsRoutes = new Hono()
const log = createLogger('ToolsRoute')

const SUMMARY_SYSTEM_PROMPT = `You generate ultra-short summaries (3-8 words) describing what a tool call is doing.

Rules:
- Output ONLY the summary text, no quotes, no punctuation, no explanation
- Use the SAME LANGUAGE as the tool arguments when possible
- Describe the user's intent, not the raw command itself
- For shell commands, explain what the command is trying to do
- For browser actions, mention the destination site or purpose
- For file operations, mention the file or the task briefly`

toolsRoutes.post('/generate-summary', async (c) => {
  const body = await c.req.json<{ toolName: string; args?: Record<string, unknown> }>()

  if (!body.toolName) {
    return c.json({ error: 'toolName is required' }, 400)
  }

  const summary = await generateToolSummary(body.toolName, body.args || {})
  return c.json({ success: true, summary })
})

toolsRoutes.get('/summaries/:sessionKey', async (c) => {
  const sessionKey = decodeURIComponent(c.req.param('sessionKey'))
  return c.json({ summaries: getSessionToolCallSummaries(sessionKey) })
})

toolsRoutes.post('/summaries', async (c) => {
  const body = await c.req.json<{
    sessionKey: string
    toolCallId: string
    summary: string
    toolName?: string
  }>()

  if (!body.sessionKey || !body.toolCallId || !body.summary?.trim()) {
    return c.json({ error: 'sessionKey, toolCallId and summary are required' }, 400)
  }

  setToolCallSummary(body.sessionKey, body.toolCallId, body.summary, body.toolName)
  return c.json({ success: true })
})

toolsRoutes.delete('/summaries/:sessionKey', async (c) => {
  const sessionKey = decodeURIComponent(c.req.param('sessionKey'))
  deleteSessionToolCallSummaries(sessionKey)
  return c.json({ success: true })
})

async function generateToolSummary(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (!getOpenclawDefaultModelTarget()) {
    return ''
  }

  try {
    const argsJson = JSON.stringify(args, null, 0)
    const truncatedArgs = argsJson.length > 500 ? `${argsJson.slice(0, 500)}...` : argsJson

    const content = await callOpenclawDefaultModelChatCompletion(
      [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Tool: ${toolName}\nArguments: ${truncatedArgs}` },
      ],
      {
        maxTokens: 40,
        temperature: 0.2,
      },
    )
    return sanitizeSummary(content)
  } catch (e: any) {
    log.warn(`Tool summary generation error: ${e.message}`)
    return ''
  }
}

function sanitizeSummary(summary: string): string {
  return summary
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[。！？!?.,;:]+$/g, '')
    .trim()
}

export { toolsRoutes }
