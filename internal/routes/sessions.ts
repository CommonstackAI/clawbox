import { Hono } from 'hono'
import { getConfig } from '../config/index'
import { openclawRpc } from '../providers/openclaw-rpc'
import { isInternalMetadataSessionKey } from '../providers/openclaw-completions'
import { createLogger } from '../logger'
import { deleteSessionToolCallSummaries } from '../tool-call-summaries/index'

const log = createLogger('Sessions')
const USER_SESSION_LIMIT = 100
const SESSION_FETCH_LIMIT = 150

export const sessionRoutes = new Hono()

function getGatewayUrl(): string {
  return getConfig().providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
}

// List sessions
sessionRoutes.get('/', async (c) => {
  try {
    const result = await openclawRpc(getGatewayUrl(), 'sessions.list', { limit: SESSION_FETCH_LIMIT })
    const sessions = (result?.sessions ?? [])
      .filter((s: any) => !isInternalMetadataSessionKey(s?.key || s?.sessionKey || s?.id || s?.sessionId))
      .slice(0, USER_SESSION_LIMIT)
      .map((s: any) => ({
        id: s.key || s.sessionKey || s.sessionId,
        sessionKey: s.key || s.sessionKey || s.sessionId,
        originalSessionId: s.sessionId,
        title: s.label || s.key || s.sessionId || 'Chat',
        updatedAt: s.updatedAt || new Date().toISOString(),
        createdAt: s.createdAt || s.updatedAt || new Date().toISOString(),
        messageCount: s.messageCount || 0,
        source: 'openclaw',
      }))
    return c.json({ sessions, total: sessions.length })
  } catch (error: any) {
    log.error(`Failed to list sessions: ${error.message}`)
    return c.json({ sessions: [], total: 0 })
  }
})

// Get session detail
sessionRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'sessions.preview', { sessionKey: id })
    return c.json({
      metadata: { id, title: result?.label || id, source: 'openclaw' },
      messageCount: result?.messageCount || 0,
    })
  } catch (error: any) {
    return c.json({ error: error.message }, 404)
  }
})

// Get session messages (chat history)
sessionRoutes.get('/:id/messages', async (c) => {
  const { id } = c.req.param()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'chat.history', { sessionKey: id, limit: 100 })
    return c.json({ messages: result?.messages ?? [], total: result?.messages?.length ?? 0 })
  } catch (error: any) {
    return c.json({ messages: [], total: 0 })
  }
})

// Delete session
sessionRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    await openclawRpc(getGatewayUrl(), 'sessions.delete', { key: id, deleteTranscript: true })
    deleteSessionToolCallSummaries(id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Reset session
sessionRoutes.post('/:id/reset', async (c) => {
  const { id } = c.req.param()
  try {
    await openclawRpc(getGatewayUrl(), 'sessions.reset', { sessionKey: id, reason: 'reset' })
    deleteSessionToolCallSummaries(id)
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Compact session
sessionRoutes.post('/:id/compact', async (c) => {
  const { id } = c.req.param()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'sessions.compact', { sessionKey: id })
    return c.json({ success: true, ...result })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Patch session (rename, etc.)
sessionRoutes.patch('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'sessions.patch', { sessionKey: id, ...body })
    return c.json({ success: true, ...result })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})
