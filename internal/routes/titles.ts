import { Hono } from 'hono'
import { getAllTitles, setTitle, deleteTitle } from '../titles/index'
import { createLogger } from '../logger'
import { openclawListSessions, openclawChatHistory } from '../providers/openclaw-rpc'
import {
  callOpenclawDefaultModelChatCompletion,
  getOpenclawDefaultModelTarget,
  isInternalMetadataSessionKey,
} from '../providers/openclaw-completions'

const log = createLogger('TitlesRoute')
const titleRoutes = new Hono()
const SUGGESTION_SOURCE_SESSION_LIMIT = 10
const SUGGESTION_SOURCE_FETCH_LIMIT = 30

// GET / — return all title mappings
titleRoutes.get('/', (c) => {
  return c.json({ titles: getAllTitles() })
})

// PUT /:id — set title
titleRoutes.put('/:id', async (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  const { title } = await c.req.json<{ title: string }>()
  if (!title) return c.json({ error: 'title is required' }, 400)
  setTitle(id, title)
  return c.json({ success: true })
})

// DELETE /:id — delete title
titleRoutes.delete('/:id', (c) => {
  const id = decodeURIComponent(c.req.param('id'))
  deleteTitle(id)
  return c.json({ success: true })
})

// POST /generate — generate title using OpenClaw's current default model
titleRoutes.post('/generate', async (c) => {
  const { sessionId, message } = await c.req.json<{ sessionId: string; message: string }>()
  if (!sessionId || !message) return c.json({ error: 'sessionId and message are required' }, 400)

  const target = getOpenclawDefaultModelTarget()
  if (!target) {
    return c.json({ error: 'OpenClaw default model not configured' }, 400)
  }

  try {
    const title = await callChatCompletion(message)
    setTitle(sessionId, title)
    return c.json({ title })
  } catch (e: any) {
    log.error(`Title generation failed: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /suggestions — generate suggested questions based on recent conversations
titleRoutes.post('/suggestions', async (c) => {
  const target = getOpenclawDefaultModelTarget()
  if (!target) {
    return c.json({ error: 'OpenClaw default model not configured' }, 400)
  }

  const body = await c.req.json().catch(() => ({}))
  const lang: string = body.lang || 'zh'

  const gatewayUrl = target.gatewayUrl

  try {
    // Fetch recent sessions
    const sessionsData = await openclawListSessions(gatewayUrl, { limit: SUGGESTION_SOURCE_FETCH_LIMIT })
    const sessions = (sessionsData?.sessions || []).filter((session: any) => {
      const sessionKey = session.sessionKey || session.key || session.id || session.sessionId
      return !isInternalMetadataSessionKey(sessionKey)
    })
    // log.info(`[Suggestions] Found ${sessions.length} sessions`)
    // log.info(`[Suggestions] Sessions data sample:`, JSON.stringify(sessions.slice(0, 2), null, 2))

    // Collect recent user messages
    const recentMessages: string[] = []
    for (const session of sessions.slice(0, SUGGESTION_SOURCE_SESSION_LIMIT)) {
      const sessionKey = session.sessionKey || session.key || session.id
      if (!sessionKey) {
        // log.warn(`[Suggestions] Session missing key:`, JSON.stringify(session))
        continue
      }
      try {
        const history = await openclawChatHistory(gatewayUrl, sessionKey, 20)
        const userMessages = (history?.messages || [])
          .filter((m: any) => m.role === 'user')
          .map((m: any) => {
            if (typeof m.content === 'string') {
              return m.content
            }
            if (Array.isArray(m.content)) {
              return m.content
                .filter((block: any) => block.type === 'text' && block.text)
                .map((block: any) => block.text)
                .join(' ')
            }
            return ''
          })
          .filter(Boolean)
        // log.info(`[Suggestions] Session ${sessionKey}: ${userMessages.length} user messages`)
        recentMessages.push(...userMessages)
      } catch (e: any) {
        log.warn(`Failed to fetch history for session ${sessionKey}: ${e.message}`)
      }
    }

    // log.info(`[Suggestions] Total recent messages collected: ${recentMessages.length}`)
    // log.info(`[Suggestions] Recent messages sample:`, recentMessages.slice(0, 5))

    const suggestions = await generateSuggestions(
      recentMessages.slice(0, 20),
      lang,
    )

    return c.json({ suggestions })
  } catch (e: any) {
    log.error(`Suggestion generation failed: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// ── Helpers ──

async function callChatCompletion(userMessage: string): Promise<string> {
  return callOpenclawDefaultModelChatCompletion(
    [
      {
        role: 'system',
        content: 'Generate a concise title (3-6 words) for the following user message. Match the language of the user message. Return ONLY the title text, no quotes or punctuation.',
      },
      { role: 'user', content: userMessage },
    ],
    {
      maxTokens: 30,
      temperature: 0.7,
    },
  )
}

async function generateSuggestions(
  recentMessages: string[],
  lang: string = 'zh',
): Promise<string[]> {
  const contextSummary = recentMessages.length > 0
    ? `Recent conversation topics:\n${recentMessages.slice(0, 10).map((m, i) => `${i + 1}. ${m.slice(0, 100)}`).join('\n')}`
    : 'No recent conversations. Generate general helpful questions.'

  // log.info(`[Suggestions] Context summary for model:`)
  // log.info(contextSummary)

  const isZh = lang.startsWith('zh')

  const systemPrompt = isZh
    ? `你是一个有帮助的助手，根据对话历史建议有趣的问题。生成5个多样化、有吸引力的问题。要求：
1. 与常见话题或最近对话主题相关（如果有的话）
2. 清晰具体
3. 话题和复杂度多样化
4. 用中文撰写

只返回一个包含5个问题字符串的JSON数组，不要其他内容。格式示例：
["问题1？", "问题2？", "问题3？", "问题4？", "问题5？"]`
    : `You are a helpful assistant that suggests interesting questions. Generate 5 diverse, engaging questions in English. IMPORTANT: All questions MUST be written in English regardless of the conversation context language. The questions should be:
1. Related to common topics or recent conversation themes (if available)
2. Clear and specific
3. Varied in topic and complexity
4. Written entirely in English

Return ONLY a JSON array of 5 English question strings, nothing else. Example format:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?"]`

  const content = await callOpenclawDefaultModelChatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: contextSummary },
    ],
    {
      maxTokens: 300,
      temperature: 0.8,
    },
  )

  // log.info(`[Suggestions] Model response:`)
  // log.info(content)

  try {
    const suggestions = JSON.parse(content)
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      // log.info(`[Suggestions] Parsed ${suggestions.length} suggestions:`, suggestions)
      return suggestions.slice(0, 5)
    }
  } catch (e) {
    log.warn('Failed to parse suggestions as JSON, falling back to line splitting')
  }

  // Fallback: split by lines and clean up
  const fallbackSuggestions = content
    .split('\n')
    .map((line: string) => line.replace(/^[\d\.\-\*\s]+/, '').trim())
    .filter((line: string) => line.length > 0)
    .slice(0, 5)

  // log.info(`[Suggestions] Fallback parsed ${fallbackSuggestions.length} suggestions:`, fallbackSuggestions)
  return fallbackSuggestions
}

export { titleRoutes }
