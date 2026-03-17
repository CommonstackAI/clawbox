import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getConfig } from '../config/index'
import { createLogger } from '../logger'
import { restartGateway, waitForGatewayPort } from '../onboard/gateway'
import { runOpenclawCmd } from '../onboard/openclaw-bin'
import { openclawGetConfig, openclawPatchConfig, openclawRpc } from '../providers/openclaw-rpc'
import { cancelAuthSession, createAuthSession, getAuthSession, updateAuthSession } from './auth-session'
import { getChannelCatalogItem, listChannelCatalog } from './catalog'
import { getFallbackChannelSchema } from './fallback-schema'
import { findSummaryById, mergeCatalogAndStatus } from './mapper'
import type {
  ChannelAuthSession,
  ChannelDetailPayload,
  ChannelPairingState,
  ChannelSummary,
  OpenClawChannelsStatusResult,
} from './types'

const log = createLogger('ChannelsFacade')

const REDACTED_SENTINEL = '__OPENCLAW_REDACTED__'
const PAIRING_PENDING_TTL_MS = 60 * 60 * 1000

type PairingRequest = {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

type PairingStore = { version: 1; requests: PairingRequest[] }
type AllowFromStore = { version: 1; allowFrom: string[] }

function getGatewayUrl(): string {
  return getConfig().providers?.openclaw?.baseUrl || ''
}

function getGatewayUrlOrThrow(): string {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    throw new Error('Gateway not configured')
  }
  return gatewayUrl
}

function safeChannelKey(channel: string): string {
  const raw = String(channel).trim().toLowerCase()
  if (!raw) throw new Error('invalid channel')
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/\.\./g, '_')
  if (!safe || safe === '_') throw new Error('invalid channel')
  return safe
}

function resolveCredentialsDir(): string {
  const oauthOverride = process.env.OPENCLAW_OAUTH_DIR?.trim()
  if (oauthOverride) return path.resolve(oauthOverride)

  const stateOverride = process.env.OPENCLAW_STATE_DIR?.trim()
  const stateDir = stateOverride ? path.resolve(stateOverride) : path.join(os.homedir(), '.openclaw')
  return path.join(stateDir, 'credentials')
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

async function readJsonSafe<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function readDiskChannelConfig(channelId: string): Record<string, unknown> {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    const raw = fs.readFileSync(configPath, 'utf8')
    const cfg = JSON.parse(raw)
    return cfg?.channels?.[channelId] || {}
  } catch {
    return {}
  }
}

function unredactEmptySecrets(redactedConfig: Record<string, unknown>, diskConfig: Record<string, unknown>): Record<string, unknown> {
  const result = { ...redactedConfig }
  for (const [key, value] of Object.entries(result)) {
    if (value !== REDACTED_SENTINEL) continue
    const diskValue = diskConfig[key]
    if (!diskValue || (typeof diskValue === 'string' && !diskValue.trim())) {
      result[key] = ''
    }
  }
  return result
}

function hasMeaningfulConfigValue(key: string, value: unknown): boolean {
  if (key === 'enabled' || key === 'defaultAccount') {
    return false
  }
  if (value === REDACTED_SENTINEL) return true
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return value === true
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([childKey, childValue]) =>
      hasMeaningfulConfigValue(childKey, childValue),
    )
  }
  return false
}

function hasMeaningfulChannelConfig(config: Record<string, unknown> | null): boolean {
  if (!config) return false
  return Object.entries(config).some(([key, value]) => hasMeaningfulConfigValue(key, value))
}

function normalizeSummaryWithConfig(summary: ChannelSummary, config: Record<string, unknown> | null): ChannelSummary {
  if (summary.configured || !hasMeaningfulChannelConfig(config)) {
    return summary
  }
  return { ...summary, configured: true }
}

async function fetchChannelsStatus(): Promise<OpenClawChannelsStatusResult> {
  const gatewayUrl = getGatewayUrlOrThrow()
  return await openclawRpc(gatewayUrl, 'channels.status', { probe: false }, 10000)
}

async function fetchChannelConfig(channelId: string): Promise<Record<string, unknown> | null> {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) return null
  try {
    const snapshot = await openclawGetConfig(gatewayUrl)
    const configObj = snapshot?.config ?? snapshot
    const channelConfig = configObj?.channels?.[channelId] || {}
    const diskConfig = readDiskChannelConfig(channelId)
    return unredactEmptySecrets(channelConfig, diskConfig)
  } catch (error: any) {
    log.warn(`Failed to fetch channel config for ${channelId}: ${error.message}`)
    return null
  }
}

async function fetchChannelSchema(channelId: string): Promise<{
  schema: Record<string, unknown> | null
  uiHints: Record<string, unknown> | null
}> {
  const fallback = getFallbackChannelSchema(channelId)

  const resolveFallback = (uiHints: Record<string, unknown> | null = null) => {
    if (!fallback) return { schema: null, uiHints }
    return {
      schema: fallback.schema,
      uiHints: uiHints ?? fallback.uiHints,
    }
  }

  const isUsableSchema = (schema: unknown): schema is Record<string, unknown> => {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return false
    const properties = (schema as Record<string, unknown>).properties
    return Boolean(properties && typeof properties === 'object' && !Array.isArray(properties) && Object.keys(properties).length > 0)
  }

  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return resolveFallback()
  }

  try {
    const result = await openclawRpc(gatewayUrl, 'config.schema.lookup', {
      path: `channels.${channelId}`,
    }, 10000)
    const hint = result?.hint && typeof result.hint === 'object' ? result.hint : null
    const uiHints = hint ? { root: hint } : null
    const schema = result?.schema && typeof result.schema === 'object'
      ? result.schema as Record<string, unknown>
      : null

    if (!isUsableSchema(schema)) {
      return resolveFallback(uiHints)
    }

    return {
      schema,
      uiHints,
    }
  } catch (error: any) {
    log.warn(`Failed to fetch channel schema for ${channelId}: ${error.message}`)
    return resolveFallback()
  }
}

async function readPairingState(
  channelId: string,
  supported: boolean,
  accountId?: string,
): Promise<ChannelPairingState> {
  if (!supported) {
    return { supported: false, pending: [], allowFrom: [] }
  }

  try {
    const pairingPath = resolvePairingPath(channelId)
    const store = await readJsonSafe<PairingStore>(pairingPath, { version: 1, requests: [] })
    const now = Date.now()
    const normalizedAccountId = accountId?.trim().toLowerCase() || ''
    const pending = (store.requests || [])
      .filter((request) => {
        if (!request || !request.code || !request.createdAt) return false
        const createdAt = Date.parse(request.createdAt)
        if (!Number.isFinite(createdAt)) return false
        return now - createdAt < PAIRING_PENDING_TTL_MS
      })
      .filter((request) => {
        if (!normalizedAccountId) return true
        const requestAccountId = String(request.meta?.accountId ?? '').trim().toLowerCase()
        return !requestAccountId || requestAccountId === normalizedAccountId
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

    const scopedPath = resolveAllowFromPath(channelId, accountId)
    const legacyPath = resolveAllowFromPath(channelId)
    const [scoped, legacy] = await Promise.all([
      readJsonSafe<AllowFromStore>(scopedPath, { version: 1, allowFrom: [] }),
      readJsonSafe<AllowFromStore>(legacyPath, { version: 1, allowFrom: [] }),
    ])

    const allowFrom = [...new Set([
      ...(scoped.allowFrom || []).map((entry) => String(entry).trim()).filter(Boolean),
      ...(legacy.allowFrom || []).map((entry) => String(entry).trim()).filter(Boolean),
    ])]

    return { supported: true, pending, allowFrom }
  } catch (error: any) {
    log.warn(`Failed to read pairing state for ${channelId}: ${error.message}`)
    return { supported, pending: [], allowFrom: [] }
  }
}

export async function listChannelCatalogFacade(): Promise<{ items: ReturnType<typeof listChannelCatalog>; generatedAt: number }> {
  return {
    items: listChannelCatalog(),
    generatedAt: Date.now(),
  }
}

export async function listChannelsFacade(): Promise<{ items: ChannelSummary[]; ts: number; gatewayError?: string }> {
  const catalog = listChannelCatalog()
  try {
    const status = await fetchChannelsStatus()
    const items = mergeCatalogAndStatus(catalog, status)
    const configs = await Promise.all(items.map(async (item) => [item.id, await fetchChannelConfig(item.id)] as const))
    const configMap = Object.fromEntries(configs)
    return {
      items: items.map((item) => normalizeSummaryWithConfig(item, configMap[item.id] ?? null)),
      ts: status.ts ?? Date.now(),
    }
  } catch (error: any) {
    return {
      items: mergeCatalogAndStatus(catalog, null),
      ts: Date.now(),
      gatewayError: error.message,
    }
  }
}

export async function getChannelSchemaFacade(channelId: string): Promise<{
  schema: Record<string, unknown> | null
  uiHints: Record<string, unknown> | null
}> {
  return fetchChannelSchema(channelId)
}

async function resolveChannelSummaryOrThrow(channelId: string): Promise<ChannelSummary> {
  const catalog = listChannelCatalog()
  const status = await fetchChannelsStatus()
  const summary = findSummaryById(catalog, status, channelId)
  if (!summary) {
    throw new Error('Channel not found')
  }
  return normalizeSummaryWithConfig(summary, await fetchChannelConfig(channelId))
}

function buildChannelEnabledPatch(
  channelId: string,
  enabled: boolean,
  accountId?: string,
  fallbackAccountId?: string,
  useAccountScope = false,
): Record<string, unknown> {
  const resolvedAccountId = accountId?.trim() || fallbackAccountId?.trim() || ''
  if (resolvedAccountId && useAccountScope) {
    return {
      channels: {
        [channelId]: {
          accounts: {
            [resolvedAccountId]: {
              enabled,
            },
          },
        },
      },
    }
  }
  return {
    channels: {
      [channelId]: {
        enabled,
      },
    },
  }
}

function isConnectedLikeMessage(message: string): boolean {
  return /already linked|already connected|session is ready|login successful/i.test(message)
}

function isErrorLikeMessage(message: string): boolean {
  return /failed|error|expired|not available|no active/i.test(message)
}

async function assertAuthChannelReady(channelId: string): Promise<ChannelSummary> {
  const status = await fetchChannelsStatus()
  const summaries = mergeCatalogAndStatus(listChannelCatalog(), status)
  const summary = summaries.find((entry) => entry.id === channelId)
  if (!summary) {
    throw new Error('Channel not found')
  }
  if (!summary.actions.canAuth) {
    throw new Error(`Channel ${channelId} does not support login flow`)
  }
  if (!summary.loaded) {
    throw new Error(`Channel ${channelId} is not loaded in the current OpenClaw runtime`)
  }
  const loadedAuthChannels = summaries.filter((entry) => entry.loaded && entry.actions.canAuth)
  if (loadedAuthChannels.length > 1) {
    throw new Error(
      `Multiple auth-capable channels are loaded (${loadedAuthChannels.map((entry) => entry.id).join(', ')}); ` +
      'ClawBox cannot safely target one provider until OpenClaw exposes channel-scoped web login.',
    )
  }
  return summary
}

export async function probeChannelFacade(channelId: string): Promise<{ summary: ChannelSummary | null }> {
  const gatewayUrl = getGatewayUrlOrThrow()
  const status = await openclawRpc(gatewayUrl, 'channels.status', { probe: true, timeoutMs: 8000 }, 12000)
  return {
    summary: findSummaryById(listChannelCatalog(), status, channelId),
  }
}

export async function setChannelEnabledFacade(channelId: string, enabled: boolean, accountId?: string): Promise<void> {
  const summary = await resolveChannelSummaryOrThrow(channelId)
  const gatewayUrl = getGatewayUrlOrThrow()
  const patch = buildChannelEnabledPatch(
    channelId,
    enabled,
    accountId,
    summary.defaultAccountId,
    Boolean(accountId || summary.accountCount > 0),
  )
  await openclawPatchConfig(gatewayUrl, patch)
}

export async function logoutChannelFacade(channelId: string, accountId?: string): Promise<void> {
  await resolveChannelSummaryOrThrow(channelId)
  const gatewayUrl = getGatewayUrlOrThrow()
  await openclawRpc(gatewayUrl, 'channels.logout', {
    channel: channelId,
    ...(accountId ? { accountId } : {}),
  })
}

export async function activateChannelFacade(channelId: string): Promise<{ activated: boolean; summary: ChannelSummary | null }> {
  const summary = await resolveChannelSummaryOrThrow(channelId)
  if (summary.loaded) {
    return { activated: true, summary }
  }
  if (!summary.configured && !summary.actions.canAuth) {
    throw new Error(`Channel ${channelId} is not configured yet`)
  }

  try {
    await runOpenclawCmd(`plugins enable ${channelId}`, 30000)
  } catch (error: any) {
    log.warn(`Failed to enable plugin ${channelId} before activation: ${error.message}`)
  }

  const restarted = await restartGateway()
  if (!restarted) {
    throw new Error('Failed to restart OpenClaw gateway')
  }
  await waitForGatewayPort()

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const status = await fetchChannelsStatus()
      const nextSummary = findSummaryById(listChannelCatalog(), status, channelId)
      if (nextSummary?.loaded) {
        return { activated: true, summary: nextSummary }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return { activated: false, summary: await resolveChannelSummaryOrThrow(channelId).catch(() => null) }
}

export async function startChannelAuthSessionFacade(params: {
  channelId: string
  accountId?: string
  force?: boolean
  timeoutMs?: number
}): Promise<ChannelAuthSession> {
  const currentSummary = await resolveChannelSummaryOrThrow(params.channelId)
  if (!currentSummary.loaded) {
    const activation = await activateChannelFacade(params.channelId)
    if (!activation.activated) {
      throw new Error(`Channel ${params.channelId} could not be activated before login`)
    }
  }
  await assertAuthChannelReady(params.channelId)
  const gatewayUrl = getGatewayUrlOrThrow()
  const result = await openclawRpc(gatewayUrl, 'web.login.start', {
    force: params.force === true,
    timeoutMs: params.timeoutMs ?? 30000,
    ...(params.accountId ? { accountId: params.accountId } : {}),
  }, (params.timeoutMs ?? 30000) + 5000)

  const message = typeof result?.message === 'string' ? result.message : 'Login started.'
  const qrDataUrl = typeof result?.qrDataUrl === 'string' ? result.qrDataUrl : undefined
  const state = qrDataUrl
    ? 'awaiting_scan'
    : isConnectedLikeMessage(message)
      ? 'connected'
      : 'starting'

  return createAuthSession({
    channelId: params.channelId,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    state,
    message,
    ...(qrDataUrl ? { qrDataUrl } : {}),
  })
}

export async function pollChannelAuthSessionFacade(params: {
  channelId: string
  sessionId: string
}): Promise<ChannelAuthSession> {
  const session = getAuthSession(params.sessionId)
  if (!session || session.channelId !== params.channelId) {
    throw new Error('Auth session not found')
  }
  if (session.state === 'connected' || session.state === 'error' || session.state === 'cancelled') {
    return session
  }

  await assertAuthChannelReady(params.channelId)
  const gatewayUrl = getGatewayUrlOrThrow()
  const result = await openclawRpc(gatewayUrl, 'web.login.wait', {
    timeoutMs: 1500,
    ...(session.accountId ? { accountId: session.accountId } : {}),
  }, 4000)

  const connected = result?.connected === true
  const message = typeof result?.message === 'string'
    ? result.message
    : connected
      ? 'Login successful.'
      : 'Waiting for scan confirmation.'
  const nextState = connected
    ? 'connected'
    : isErrorLikeMessage(message)
      ? 'error'
      : session.qrDataUrl
        ? 'awaiting_scan'
        : 'connecting'

  return updateAuthSession(session.sessionId, {
    state: nextState,
    message,
    ...(nextState === 'error' ? { error: message } : {}),
  }) ?? session
}

export async function cancelChannelAuthSessionFacade(params: {
  channelId: string
  sessionId: string
}): Promise<ChannelAuthSession> {
  const session = getAuthSession(params.sessionId)
  if (!session || session.channelId !== params.channelId) {
    throw new Error('Auth session not found')
  }
  return cancelAuthSession(session.sessionId) ?? session
}

export async function getChannelDetailFacade(channelId: string): Promise<ChannelDetailPayload> {
  const normalized = channelId.trim().toLowerCase()
  const catalog = listChannelCatalog()
  let gatewayError: string | undefined
  let status: OpenClawChannelsStatusResult | null = null

  try {
    status = await fetchChannelsStatus()
  } catch (error: any) {
    gatewayError = error.message
  }

  const summary = findSummaryById(catalog, status, normalized)
  if (!summary) {
    throw new Error('Channel not found')
  }

  const catalogItem = getChannelCatalogItem(normalized) ?? {
    id: summary.id,
    label: summary.label,
    detailLabel: summary.detailLabel,
    description: summary.description,
    order: 999,
    source: summary.source,
    archetype: 'unknown' as const,
    iconKey: summary.id,
    capabilities: summary.capabilities,
    defaults: {
      supportsPairing: false,
      supportsProbe: true,
      supportsLogout: false,
      supportsConfig: true,
      supportsAuthFlow: false,
    },
  }

  const [config, schema, pairing] = await Promise.all([
    fetchChannelConfig(normalized),
    fetchChannelSchema(normalized),
    readPairingState(normalized, catalogItem.defaults.supportsPairing, summary.defaultAccountId),
  ])

  const normalizedSummary = normalizeSummaryWithConfig(summary, config)

  const issues = gatewayError ? [gatewayError] : []
  if (!normalizedSummary.loaded && normalizedSummary.installable) {
    issues.push('Channel is available in the ClawBox catalog but not loaded in the current OpenClaw runtime')
  }

  return {
    catalog: catalogItem,
    summary: normalizedSummary,
    config,
    schema: schema.schema,
    uiHints: schema.uiHints,
    diagnostics: {
      ...(normalizedSummary.lastError ? { lastError: normalizedSummary.lastError } : {}),
      issues,
      ...(status?.channels?.[normalized] ? { rawStatus: status.channels[normalized] } : {}),
      ...(config ? { rawConfig: config } : {}),
    },
    pairing,
    auth: {
      supported: catalogItem.defaults.supportsAuthFlow,
      state: catalogItem.defaults.supportsAuthFlow ? 'idle' : 'unsupported',
    },
  }
}
