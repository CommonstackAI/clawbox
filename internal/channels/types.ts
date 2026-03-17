export type ChannelArchetype =
  | 'bot_token'
  | 'webhook'
  | 'socket'
  | 'qr_link'
  | 'local_bridge'
  | 'oauth_enterprise'
  | 'unknown'

export type ChannelCapabilities = {
  threads: boolean
  media: boolean
  reactions: boolean
  polls: boolean
  nativeCommands: boolean
  blockStreaming: boolean
  multiAccount: boolean
}

export type ChannelDefaults = {
  supportsPairing: boolean
  supportsProbe: boolean
  supportsLogout: boolean
  supportsConfig: boolean
  supportsAuthFlow: boolean
}

export type ChannelCatalogItem = {
  id: string
  label: string
  detailLabel?: string
  description: string
  order: number
  source: 'core' | 'extension'
  docsPath?: string
  aliases?: string[]
  iconKey?: string
  archetype: ChannelArchetype
  capabilities: ChannelCapabilities
  defaults: ChannelDefaults
}

export type ChannelActionFlags = {
  canView: boolean
  canConfigure: boolean
  canProbe: boolean
  canEnable: boolean
  canDisable: boolean
  canLogout: boolean
  canPairing: boolean
  canAuth: boolean
  canManageAccounts: boolean
}

export type OpenClawChannelAccountSnapshot = Record<string, unknown>

export type OpenClawChannelsStatusResult = {
  ts: number
  channelOrder?: string[]
  channelLabels?: Record<string, string>
  channelDetailLabels?: Record<string, string>
  channelMeta?: Array<{ id: string; label: string; detailLabel?: string; systemImage?: string }>
  channels?: Record<string, unknown>
  channelAccounts?: Record<string, OpenClawChannelAccountSnapshot[]>
  channelDefaultAccountId?: Record<string, string>
}

export type ChannelSummary = {
  id: string
  label: string
  detailLabel?: string
  description: string
  source: 'core' | 'extension'
  known: boolean
  loaded: boolean
  installable: boolean
  configured: boolean
  enabled: boolean
  running: boolean
  connected: boolean
  health: 'ok' | 'warn' | 'error' | 'idle'
  defaultAccountId?: string
  accountCount: number
  accounts: OpenClawChannelAccountSnapshot[]
  capabilities: ChannelCapabilities
  actions: ChannelActionFlags
  lastError?: string
}

export type ChannelPairingState = {
  supported: boolean
  pending: Array<Record<string, unknown>>
  allowFrom: string[]
}

export type ChannelDetailPayload = {
  catalog: ChannelCatalogItem
  summary: ChannelSummary
  config: Record<string, unknown> | null
  schema: Record<string, unknown> | null
  uiHints: Record<string, unknown> | null
  diagnostics: {
    lastError?: string
    issues: string[]
    rawStatus?: unknown
    rawConfig?: unknown
  }
  pairing: ChannelPairingState
  auth: {
    supported: boolean
    state: 'idle' | 'unsupported'
  }
}

export type ChannelAuthSessionState =
  | 'idle'
  | 'starting'
  | 'awaiting_scan'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'cancelled'
  | 'unsupported'

export type ChannelAuthSession = {
  sessionId: string
  channelId: string
  accountId?: string
  state: ChannelAuthSessionState
  message: string
  qrDataUrl?: string
  error?: string
  startedAt: number
  updatedAt: number
  expiresAt: number
}
