import { getChannelCatalogItem } from './catalog'

import type {
  ChannelActionFlags,
  ChannelCatalogItem,
  ChannelSummary,
  OpenClawChannelAccountSnapshot,
  OpenClawChannelsStatusResult,
} from './types'

function getBooleanField(account: OpenClawChannelAccountSnapshot, key: string): boolean {
  return account[key] === true
}

function getStringField(account: OpenClawChannelAccountSnapshot, key: string): string | undefined {
  const value = account[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function pickAccounts(status: OpenClawChannelsStatusResult, channelId: string): OpenClawChannelAccountSnapshot[] {
  return Array.isArray(status.channelAccounts?.[channelId]) ? status.channelAccounts?.[channelId] ?? [] : []
}

function pickSummaryStatus(status: OpenClawChannelsStatusResult, channelId: string): Record<string, unknown> {
  const raw = status.channels?.[channelId]
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
}

function pickConfigured(status: OpenClawChannelsStatusResult, channelId: string, accounts: OpenClawChannelAccountSnapshot[]): boolean {
  if (accounts.some((account) => getBooleanField(account, 'configured'))) return true
  return pickSummaryStatus(status, channelId).configured === true
}

function pickEnabled(accounts: OpenClawChannelAccountSnapshot[], configured: boolean): boolean {
  if (accounts.length === 0) return configured
  return accounts.some((account) => account.enabled !== false)
}

function pickRunning(accounts: OpenClawChannelAccountSnapshot[]): boolean {
  return accounts.some((account) => getBooleanField(account, 'running') || getBooleanField(account, 'connected'))
}

function pickConnected(accounts: OpenClawChannelAccountSnapshot[]): boolean {
  return accounts.some((account) => getBooleanField(account, 'connected'))
}

function pickLastError(accounts: OpenClawChannelAccountSnapshot[]): string | undefined {
  for (const account of accounts) {
    const error = getStringField(account, 'lastError')
    if (error) return error
  }
  return undefined
}

export function pickHealth(params: {
  loaded: boolean
  configured: boolean
  connected: boolean
  lastError?: string
}): ChannelSummary['health'] {
  if (params.connected) return 'ok'
  if (params.lastError) return 'error'
  if (params.configured) return 'warn'
  return params.loaded ? 'idle' : 'idle'
}

export function buildActionFlags(item: ChannelCatalogItem, loaded: boolean): ChannelActionFlags {
  return {
    canView: true,
    canConfigure: item.defaults.supportsConfig,
    canProbe: item.defaults.supportsProbe && loaded,
    canEnable: loaded && item.defaults.supportsConfig,
    canDisable: loaded && item.defaults.supportsConfig,
    canLogout: item.defaults.supportsLogout && loaded,
    canPairing: item.defaults.supportsPairing,
    canAuth: item.defaults.supportsAuthFlow,
    canManageAccounts: item.capabilities.multiAccount && loaded,
  }
}

export function buildFallbackCatalogItem(channelId: string, status: OpenClawChannelsStatusResult): ChannelCatalogItem {
  const meta = status.channelMeta?.find((entry) => entry.id === channelId)
  const known = getChannelCatalogItem(channelId)
  if (known) return known
  return {
    id: channelId,
    label: meta?.label || status.channelLabels?.[channelId] || channelId,
    detailLabel: meta?.detailLabel || status.channelDetailLabels?.[channelId],
    description: 'Loaded OpenClaw channel',
    order: 999,
    source: 'extension',
    iconKey: channelId,
    archetype: 'unknown',
    capabilities: {
      threads: false,
      media: false,
      reactions: false,
      polls: false,
      nativeCommands: false,
      blockStreaming: false,
      multiAccount: false,
    },
    defaults: {
      supportsPairing: false,
      supportsProbe: true,
      supportsLogout: false,
      supportsConfig: true,
      supportsAuthFlow: false,
    },
  }
}

export function buildCatalogOnlySummary(item: ChannelCatalogItem): ChannelSummary {
  return {
    id: item.id,
    label: item.label,
    detailLabel: item.detailLabel,
    description: item.description,
    source: item.source,
    known: true,
    loaded: false,
    installable: item.source === 'extension',
    configured: false,
    enabled: false,
    running: false,
    connected: false,
    health: 'idle',
    accountCount: 0,
    accounts: [],
    capabilities: item.capabilities,
    actions: buildActionFlags(item, false),
  }
}

export function mapLoadedSummary(item: ChannelCatalogItem, status: OpenClawChannelsStatusResult): ChannelSummary {
  const accounts = pickAccounts(status, item.id)
  const configured = pickConfigured(status, item.id, accounts)
  const enabled = pickEnabled(accounts, configured)
  const running = pickRunning(accounts)
  const connected = pickConnected(accounts)
  const lastError = pickLastError(accounts)

  return {
    id: item.id,
    label: status.channelLabels?.[item.id] || item.label,
    detailLabel: status.channelDetailLabels?.[item.id] || item.detailLabel,
    description: item.description,
    source: item.source,
    known: true,
    loaded: true,
    installable: false,
    configured,
    enabled,
    running,
    connected,
    health: pickHealth({ loaded: true, configured, connected, lastError }),
    defaultAccountId: status.channelDefaultAccountId?.[item.id],
    accountCount: accounts.length,
    accounts,
    capabilities: item.capabilities,
    actions: buildActionFlags(item, true),
    ...(lastError ? { lastError } : {}),
  }
}

export function mergeCatalogAndStatus(
  catalog: ChannelCatalogItem[],
  status: OpenClawChannelsStatusResult | null,
): ChannelSummary[] {
  if (!status) {
    return catalog.map((item) => buildCatalogOnlySummary(item))
  }

  const loadedIds = new Set<string>([
    ...Object.keys(status.channels ?? {}),
    ...Object.keys(status.channelAccounts ?? {}),
  ])
  const summaries: ChannelSummary[] = catalog.map((item) =>
    loadedIds.has(item.id)
      ? mapLoadedSummary(item, status)
      : buildCatalogOnlySummary(item),
  )

  for (const channelId of loadedIds) {
    if (catalog.some((item) => item.id === channelId)) continue
    const item = buildFallbackCatalogItem(channelId, status)
    summaries.push(mapLoadedSummary(item, status))
  }

  return summaries.sort((a, b) => {
    if (a.loaded !== b.loaded) return a.loaded ? -1 : 1
    const orderA = catalog.find((item) => item.id === a.id)?.order ?? 999
    const orderB = catalog.find((item) => item.id === b.id)?.order ?? 999
    if (orderA !== orderB) return orderA - orderB
    return a.label.localeCompare(b.label)
  })
}

export function findSummaryById(
  catalog: ChannelCatalogItem[],
  status: OpenClawChannelsStatusResult | null,
  channelId: string,
): ChannelSummary | null {
  const normalized = channelId.trim().toLowerCase()
  const item = catalog.find((entry) => entry.id === normalized)
  if (item && !status) return buildCatalogOnlySummary(item)
  if (item && status) {
    const loaded = Boolean(status.channels?.[normalized] || status.channelAccounts?.[normalized])
    return loaded ? mapLoadedSummary(item, status) : buildCatalogOnlySummary(item)
  }
  if (!status) return null
  const loaded = Boolean(status.channels?.[normalized] || status.channelAccounts?.[normalized])
  if (!loaded) return null
  return mapLoadedSummary(buildFallbackCatalogItem(normalized, status), status)
}
