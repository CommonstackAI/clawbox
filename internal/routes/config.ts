import { Hono } from 'hono'
import { getConfig, patchConfig, saveConfig, getConfigPath } from '../config/index'
import {
  openclawListSessions, openclawDeleteSession, openclawResetSession,
  openclawChatHistory, openclawListModels, openclawGetConfig, openclawRpc, openclawPatchConfig,
} from '../providers/openclaw-rpc'
import { deleteSessionToolCallSummaries } from '../tool-call-summaries/index'

export const configRoutes = new Hono()

// GET /api/config
configRoutes.get('/', async (c) => {
  const config = getConfig()
  return c.json({ config, configPath: getConfigPath(), lastModified: config.meta?.lastTouchedAt })
})

// PATCH /api/config
configRoutes.patch('/', async (c) => {
  const body = await c.req.json()
  try {
    const updated = patchConfig(body)
    return c.json({ success: true, config: updated })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// POST /api/config
configRoutes.post('/', async (c) => {
  const body = await c.req.json()
  try {
    saveConfig(body)
    return c.json({ success: true })
  } catch (e: any) {
    return c.json({ error: e.message }, 400)
  }
})

// ── OpenClaw gateway proxy endpoints ──

// Check connectivity and fetch models
configRoutes.get('/providers/openclaw/check', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  if (!gatewayUrl) return c.json({ ok: false, error: 'gatewayUrl is required', models: [] }, 400)
  try {
    const [modelsResult, configResult] = await Promise.all([
      openclawRpc(gatewayUrl, 'models.list'),
      openclawGetConfig(gatewayUrl),
    ])
    const models = modelsResult?.models ?? []
    const parsed = configResult?.parsed || configResult?.resolved || {}
    const rawDefault = parsed?.agents?.defaults?.model?.primary || ''
    const defaultModel = rawDefault
    const slashIndex = typeof rawDefault === 'string' ? rawDefault.indexOf('/') : -1
    const activeProviderId = slashIndex > 0 ? rawDefault.slice(0, slashIndex) : ''
    const activeProviderBaseUrl = activeProviderId
      ? parsed?.models?.providers?.[activeProviderId]?.baseUrl || ''
      : ''
    return c.json({
      ok: true,
      models,
      config: {
        defaultModel,
        activeProviderId,
        activeProviderBaseUrl,
      },
    })
  } catch (error: any) {
    return c.json({ ok: false, error: error?.message || 'Connection failed', models: [] })
  }
})
// List sessions via gateway
configRoutes.get('/providers/openclaw/sessions', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    const result = await openclawListSessions(gatewayUrl)
    return c.json({ ok: true, ...result })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to list sessions' })
  }
})

// Delete session via gateway
configRoutes.delete('/providers/openclaw/sessions/:key', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  const key = decodeURIComponent(c.req.param('key'))
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    await openclawDeleteSession(gatewayUrl, key)
    deleteSessionToolCallSummaries(key)
    return c.json({ ok: true })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to delete session' })
  }
})

// Reset session via gateway
configRoutes.post('/providers/openclaw/sessions/:key/reset', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  const key = decodeURIComponent(c.req.param('key'))
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    await openclawResetSession(gatewayUrl, key)
    deleteSessionToolCallSummaries(key)
    return c.json({ ok: true })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to reset session' })
  }
})

// Get chat history via gateway
configRoutes.get('/providers/openclaw/sessions/:key/history', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  const key = decodeURIComponent(c.req.param('key'))
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    const result = await openclawChatHistory(gatewayUrl, key)
    return c.json({ ok: true, ...result })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to get history' })
  }
})

// Patch OpenClaw gateway config
configRoutes.patch('/providers/openclaw/config', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    const body = await c.req.json()
    const result = await openclawPatchConfig(gatewayUrl, body)
    return c.json({ ok: true, ...result })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'Failed to patch config' })
  }
})

// Generic RPC proxy - for any gateway method
configRoutes.post('/providers/openclaw/rpc', async (c) => {
  const gatewayUrl = c.req.query('gatewayUrl')
  if (!gatewayUrl) return c.json({ error: 'gatewayUrl is required' }, 400)
  try {
    const { method, params } = await c.req.json()
    if (!method) return c.json({ error: 'method is required' }, 400)
    const result = await openclawRpc(gatewayUrl, method, params || {})
    return c.json({ ok: true, result })
  } catch (error: any) {
    return c.json({ ok: false, error: error.message || 'RPC failed' })
  }
})
