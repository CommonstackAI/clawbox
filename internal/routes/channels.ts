import { Hono } from 'hono'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getConfig } from '../config/index'
import { openclawRpc, openclawGetConfig, openclawPatchConfig } from '../providers/openclaw-rpc'
import { createLogger } from '../logger'
import {
  activateChannelFacade,
  cancelChannelAuthSessionFacade,
  getChannelDetailFacade,
  getChannelSchemaFacade,
  listChannelCatalogFacade,
  listChannelsFacade,
  logoutChannelFacade,
  pollChannelAuthSessionFacade,
  probeChannelFacade,
  setChannelEnabledFacade,
  startChannelAuthSessionFacade,
} from '../channels/facade'

const log = createLogger('Channels')

export const channelRoutes = new Hono()

function getGatewayUrl(): string {
  const config = getConfig()
  return config.providers?.openclaw?.baseUrl || ''
}

// ── Pairing file helpers ──

const PAIRING_PENDING_TTL_MS = 60 * 60 * 1000

function resolveCredentialsDir(): string {
  const oauthOverride = process.env.OPENCLAW_OAUTH_DIR?.trim()
  if (oauthOverride) return path.resolve(oauthOverride)

  const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim()
  const stateDir = stateOverride ? path.resolve(stateOverride) : path.join(os.homedir(), '.openclaw')
  return path.join(stateDir, 'credentials')
}

function safeChannelKey(channel: string): string {
  const raw = String(channel).trim().toLowerCase()
  if (!raw) throw new Error('invalid channel')
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_')
  if (!safe || safe === '_') throw new Error('invalid channel')
  return safe
}

function resolvePairingPath(channel: string): string {
  return path.join(resolveCredentialsDir(), `${safeChannelKey(channel)}-pairing.json`)
}

function resolveAllowFromPath(channel: string, accountId?: string): string {
  const base = safeChannelKey(channel)
  const normalized = accountId?.trim().toLowerCase() || ''
  if (!normalized) return path.join(resolveCredentialsDir(), `${base}-allowFrom.json`)
  const safeAccount = normalized.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_')
  return path.join(resolveCredentialsDir(), `${base}-${safeAccount}-allowFrom.json`)
}

type PairingRequest = {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

type PairingStore = { version: 1; requests: PairingRequest[] }
type AllowFromStore = { version: 1; allowFrom: string[] }

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true })
  const tmp = filePath + '.tmp.' + Date.now()
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.promises.rename(tmp, filePath)
}

// GET /catalog — ClawBox channel catalog
channelRoutes.get('/catalog', async (c) => {
  const result = await listChannelCatalogFacade()
  return c.json(result)
})

// GET / — facade summary list for Plugins page
channelRoutes.get('/', async (c) => {
  const result = await listChannelsFacade()
  return c.json(result)
})

// GET /status — proxy channels.status from OpenClaw gateway
channelRoutes.get('/status', async (c) => {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }
  try {
    const result = await openclawRpc(gatewayUrl, 'channels.status', { probe: false }, 10000)
    return c.json(result)
  } catch (e: any) {
    log.error(`Failed to get channels status: ${e.message}`)
    return c.json({ error: e.message }, 502)
  }
})

// GET /status/probe — probe with health check
channelRoutes.get('/status/probe', async (c) => {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }
  try {
    const result = await openclawRpc(gatewayUrl, 'channels.status', { probe: true, timeoutMs: 8000 }, 12000)
    return c.json(result)
  } catch (e: any) {
    log.error(`Failed to probe channels: ${e.message}`)
    return c.json({ error: e.message }, 502)
  }
})

// OpenClaw redacts ALL sensitive strings (including empty ones) to __OPENCLAW_REDACTED__.
// This makes the frontend unable to distinguish "configured" from "empty".
// Fix: read the on-disk config to un-redact fields that are actually empty.
const REDACTED_SENTINEL = '__OPENCLAW_REDACTED__'

function unredactEmptySecrets(redactedConfig: Record<string, any>, diskConfig: Record<string, any>): Record<string, any> {
  const result = { ...redactedConfig }
  for (const [key, value] of Object.entries(result)) {
    if (value === REDACTED_SENTINEL) {
      const diskValue = diskConfig[key]
      // If the on-disk value is empty (or missing), expose it as empty instead of redacted
      if (!diskValue || (typeof diskValue === 'string' && !diskValue.trim())) {
        result[key] = ''
      }
    }
  }
  return result
}

function readDiskChannelConfig(channelId: string): Record<string, any> {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    const raw = fs.readFileSync(configPath, 'utf8')
    const cfg = JSON.parse(raw)
    return cfg?.channels?.[channelId] || {}
  } catch {
    return {}
  }
}

// GET /config/:channelId — get channel config from OpenClaw config
channelRoutes.get('/config/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }
  try {
    const snapshot = await openclawGetConfig(gatewayUrl)
    // openclawGetConfig returns a ConfigFileSnapshot: { config: {...}, raw, hash, ... }
    const configObj = snapshot?.config ?? snapshot
    const channelConfig = configObj?.channels?.[channelId] || {}

    // Un-redact empty secrets so the frontend can distinguish "configured" from "empty"
    const diskConfig = readDiskChannelConfig(channelId)
    const fixedConfig = unredactEmptySecrets(channelConfig, diskConfig)

    return c.json({ config: fixedConfig })
  } catch (e: any) {
    log.error(`Failed to get ${channelId} config: ${e.message}`)
    return c.json({ error: e.message }, 502)
  }
})

// PATCH /config/:channelId — update channel config via OpenClaw config.patch
channelRoutes.patch('/config/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }
  try {
    const body = await c.req.json()
    const result = await openclawPatchConfig(gatewayUrl, {
      channels: { [channelId]: body },
    })
    return c.json({ success: true, result })
  } catch (e: any) {
    log.error(`Failed to update ${channelId} config: ${e.message}`)
    return c.json({ error: e.message }, 502)
  }
})

// POST /logout/:channelId — logout a channel account
channelRoutes.post('/logout/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }
  try {
    const body = await c.req.json().catch(() => ({}))
    const result = await openclawRpc(gatewayUrl, 'channels.logout', {
      channel: channelId,
      accountId: body.accountId,
    })
    return c.json({ success: true, result })
  } catch (e: any) {
    log.error(`Failed to logout ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 502)
  }
})

// ── Pairing management routes ──

// GET /pairing/:channelId — list pending pairing requests
channelRoutes.get('/pairing/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const filePath = resolvePairingPath(channelId)
    const store = await readJsonSafe<PairingStore>(filePath, { version: 1, requests: [] })
    const now = Date.now()
    const requests = (store.requests || [])
      .filter((r) => {
        if (!r || !r.code || !r.createdAt) return false
        const createdAt = Date.parse(r.createdAt)
        if (!Number.isFinite(createdAt)) return false
        return now - createdAt < PAIRING_PENDING_TTL_MS
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return c.json({ requests })
  } catch (e: any) {
    log.error(`Failed to read pairing for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /pairing/:channelId/approve — approve a pairing request
channelRoutes.post('/pairing/:channelId/approve', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const { code } = await c.req.json()
    if (!code) return c.json({ error: 'code is required' }, 400)
    const normalizedCode = String(code).trim().toUpperCase()

    // Read pairing file and find matching request
    const pairingPath = resolvePairingPath(channelId)
    const store = await readJsonSafe<PairingStore>(pairingPath, { version: 1, requests: [] })
    const idx = store.requests.findIndex(
      (r) => String(r.code ?? '').trim().toUpperCase() === normalizedCode,
    )
    if (idx < 0) {
      return c.json({ error: 'Pairing code not found or expired' }, 404)
    }

    const entry = store.requests[idx]
    const userId = entry.id

    // Remove from pairing requests
    store.requests.splice(idx, 1)
    await writeJsonAtomic(pairingPath, store)

    // Add to allowFrom
    const accountId = entry.meta?.accountId?.trim() || 'default'
    const allowFromPath = resolveAllowFromPath(channelId, accountId)
    const allowFromStore = await readJsonSafe<AllowFromStore>(allowFromPath, { version: 1, allowFrom: [] })
    const normalizedId = String(userId).trim()
    if (!allowFromStore.allowFrom.includes(normalizedId)) {
      allowFromStore.allowFrom.push(normalizedId)
    }
    await writeJsonAtomic(allowFromPath, allowFromStore)

    log.info(`Approved pairing for ${channelId}: user=${normalizedId}`)
    return c.json({ success: true, id: normalizedId })
  } catch (e: any) {
    log.error(`Failed to approve pairing for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// GET /pairing/:channelId/allowFrom — list approved users
channelRoutes.get('/pairing/:channelId/allowFrom', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const accountId = c.req.query('accountId')?.trim() || 'default'
    // Read both requested-account scoped and legacy unscoped files
    const scopedPath = resolveAllowFromPath(channelId, accountId)
    const legacyPath = resolveAllowFromPath(channelId)

    const [scoped, legacy] = await Promise.all([
      readJsonSafe<AllowFromStore>(scopedPath, { version: 1, allowFrom: [] }),
      readJsonSafe<AllowFromStore>(legacyPath, { version: 1, allowFrom: [] }),
    ])

    // Merge and deduplicate
    const merged = [...new Set([
      ...(scoped.allowFrom || []).map((s) => String(s).trim()).filter(Boolean),
      ...(legacy.allowFrom || []).map((s) => String(s).trim()).filter(Boolean),
    ])]

    return c.json({ allowFrom: merged })
  } catch (e: any) {
    log.error(`Failed to read allowFrom for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/actions/probe — facade probe
channelRoutes.post('/:channelId/actions/probe', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const result = await probeChannelFacade(channelId)
    return c.json({ success: true, ...result })
  } catch (e: any) {
    log.error(`Failed to probe ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/actions/enable — facade enable
channelRoutes.post('/:channelId/actions/enable', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const body = await c.req.json().catch(() => ({}))
    await setChannelEnabledFacade(channelId, true, body.accountId)
    return c.json({ success: true })
  } catch (e: any) {
    log.error(`Failed to enable ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/actions/disable — facade disable
channelRoutes.post('/:channelId/actions/disable', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const body = await c.req.json().catch(() => ({}))
    await setChannelEnabledFacade(channelId, false, body.accountId)
    return c.json({ success: true })
  } catch (e: any) {
    log.error(`Failed to disable ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/actions/activate — restart gateway and attempt to load a configured channel
channelRoutes.post('/:channelId/actions/activate', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const result = await activateChannelFacade(channelId)
    return c.json({ success: true, ...result })
  } catch (e: any) {
    log.error(`Failed to activate ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/actions/logout — facade logout
channelRoutes.post('/:channelId/actions/logout', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const body = await c.req.json().catch(() => ({}))
    await logoutChannelFacade(channelId, body.accountId)
    return c.json({ success: true })
  } catch (e: any) {
    log.error(`Failed to logout ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// POST /:channelId/auth/start — start an auth session for QR/web login channels
channelRoutes.post('/:channelId/auth/start', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const body = await c.req.json().catch(() => ({}))
    const result = await startChannelAuthSessionFacade({
      channelId,
      accountId: body.accountId,
      force: body.force === true,
      timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    })
    return c.json(result)
  } catch (e: any) {
    log.error(`Failed to start auth session for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})

// GET /:channelId/auth/session/:sessionId — poll auth session state
channelRoutes.get('/:channelId/auth/session/:sessionId', async (c) => {
  const channelId = c.req.param('channelId')
  const sessionId = c.req.param('sessionId')
  try {
    const result = await pollChannelAuthSessionFacade({ channelId, sessionId })
    return c.json(result)
  } catch (e: any) {
    log.error(`Failed to poll auth session for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 404)
  }
})

// POST /:channelId/auth/cancel — stop tracking an auth session in ClawBox
channelRoutes.post('/:channelId/auth/cancel', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const body = await c.req.json()
    if (!body?.sessionId) return c.json({ error: 'sessionId is required' }, 400)
    const result = await cancelChannelAuthSessionFacade({ channelId, sessionId: body.sessionId })
    return c.json(result)
  } catch (e: any) {
    log.error(`Failed to cancel auth session for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 404)
  }
})

// GET /:channelId/schema — facade schema for dynamic config panels
channelRoutes.get('/:channelId/schema', async (c) => {
  const channelId = c.req.param('channelId')
  const result = await getChannelSchemaFacade(channelId)
  return c.json(result)
})

// GET /:channelId — facade detail payload for Plugins page
channelRoutes.get('/:channelId', async (c) => {
  const channelId = c.req.param('channelId')
  try {
    const result = await getChannelDetailFacade(channelId)
    return c.json(result)
  } catch (e: any) {
    if (e.message === 'Channel not found') {
      return c.json({ error: e.message }, 404)
    }
    log.error(`Failed to get facade detail for ${channelId}: ${e.message}`)
    return c.json({ error: e.message }, 500)
  }
})
