// ── Message & Conversation Types ──

export interface ToolCallData {
  toolName: string
  toolCallId: string
  args: Record<string, any>
  result?: string
  summary?: string
  summaryStatus?: 'pending' | 'ready' | 'failed'
  status: 'running' | 'completed' | 'error'
}

export type MessageBlock =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; data: ToolCallData }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  blocks: MessageBlock[]
  timestamp: number
  isLoading?: boolean
  error?: boolean
  tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  source?: string
}

export interface ContextUsage {
  currentTokens: number
  maxTokens: number
  usageRatio: number
}

// ── Session Types ──

export interface SessionListItem {
  id: string
  sessionKey?: string
  originalSessionId?: string
  title: string
  updatedAt: string
  createdAt: string
  messageCount: number
  source?: string
}

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant'
  blocks: MessageBlock[]
  timestamp: string
  tokenUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
}

// ── Agent Types ──

export interface AgentSummary {
  id: string
  name: string
  default: boolean
  model: string
  identity?: { name?: string; avatar?: string; bio?: string }
  skills: string[]
  toolsEnabled: string[]
}

export interface AgentConfig {
  id: string
  name?: string
  model?: string
  default?: boolean
  [key: string]: any
}

export interface SkillsStatusConfigCheck {
  path: string
  satisfied: boolean
}

export interface SkillInstallOption {
  id: string
  kind: 'brew' | 'node' | 'go' | 'uv' | 'download'
  label: string
  bins: string[]
}

export interface SkillRequirementSet {
  bins: string[]
  env: string[]
  config: string[]
  os: string[]
}

export interface SkillStatusEntry {
  name: string
  description: string
  source: string
  filePath: string
  baseDir: string
  skillKey: string
  bundled: boolean
  primaryEnv?: string
  emoji?: string
  homepage?: string
  always: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  eligible: boolean
  requirements: SkillRequirementSet
  missing: SkillRequirementSet
  configChecks: SkillsStatusConfigCheck[]
  install: SkillInstallOption[]
}

export interface SkillStatusReport {
  workspaceDir: string
  managedSkillsDir: string
  skills: SkillStatusEntry[]
}

export interface ClawhubCliStatus {
  available: boolean
  version?: string
  runtimeSource?: 'system' | 'portable'
  autoInstallable: boolean
}

export interface ClawhubAuthStatus {
  hasToken: boolean
  verified: boolean
  handle?: string | null
  displayName?: string | null
  registry?: string
  code?: 'not_logged_in' | 'invalid_token' | 'network' | 'upstream'
  error?: string
}

export interface ClawhubSearchItem {
  score: number
  slug: string
  displayName: string
  summary: string
  version: string | null
  updatedAt: number | null
}

export type ManualSkillImportSource = 'directory' | 'archive' | 'url'

export type UpstreamProviderType = 'commonstack' | 'custom'
export type CustomProviderCompatibility = 'openai' | 'anthropic'

// ── Config Types ──

export interface OpenClawProviderConfig {
  apiKey: string
  baseUrl: string
  models: string[]
  defaultModel: string
  upstream: {
    active: UpstreamProviderType
    commonstack: {
      baseUrl: string
      apiKey: string
    }
    custom: {
      baseUrl: string
      apiKey: string
      providerId: string
      compatibility: CustomProviderCompatibility
    }
  }
}

export interface ClawboxConfig {
  providers: {
    currentProvider: string
    openclaw: OpenClawProviderConfig
  }
  workspaceDir?: string
  envMode?: 'portable' | 'system'
  meta?: { lastTouchedAt?: string }
}

// ── Cron Types ──

export type CronSchedule =
  | { kind: 'at'; at: string }
  | { kind: 'every'; everyMs: number; anchorMs?: number }
  | { kind: 'cron'; expr: string; tz?: string }

export type CronPayload =
  | { kind: 'systemEvent'; text: string }
  | { kind: 'agentTurn'; message: string; model?: string; thinking?: string; timeoutSeconds?: number }

export type CronDelivery = {
  mode: 'none' | 'announce' | 'webhook'
  channel?: string
  to?: string
  bestEffort?: boolean
}

export type CronJobState = {
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
}

export type CronJob = {
  id: string
  agentId?: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean
  createdAtMs: number
  updatedAtMs: number
  schedule: CronSchedule
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'next-heartbeat' | 'now'
  payload: CronPayload
  delivery?: CronDelivery
  state?: CronJobState
}

export type CronStatus = {
  enabled: boolean
  jobs: number
  nextWakeAtMs?: number | null
}

export type CronRunLogEntry = {
  ts: number
  jobId: string
  status: 'ok' | 'error' | 'skipped'
  durationMs?: number
  runAtMs?: number
  error?: string
  summary?: string
  delivered?: boolean
  deliveryStatus?: 'delivered' | 'not-delivered' | 'unknown' | 'not-requested'
  deliveryError?: string
  sessionId?: string
  sessionKey?: string
  model?: string
  provider?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

// ── Soul Types ──

export interface SoulFile {
  content: string
  missing: boolean
}

export interface SoulTemplate {
  id: string
  name: string
  icon: string
  description: string
  content: string
  createdAt: number
  updatedAt: number
}

// ── Pairing Types ──

export interface PairingRequest {
  id: string
  code: string
  createdAt: string
  lastSeenAt: string
  meta?: Record<string, string>
}

// ── Channel Types ──

export type ChannelArchetype =
  | 'bot_token'
  | 'webhook'
  | 'socket'
  | 'qr_link'
  | 'local_bridge'
  | 'oauth_enterprise'
  | 'unknown'

export interface ChannelCapabilities {
  threads: boolean
  media: boolean
  reactions: boolean
  polls: boolean
  nativeCommands: boolean
  blockStreaming: boolean
  multiAccount: boolean
}

export interface ChannelActionFlags {
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

export interface ChannelCatalogItem {
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
  defaults: {
    supportsPairing: boolean
    supportsProbe: boolean
    supportsLogout: boolean
    supportsConfig: boolean
    supportsAuthFlow: boolean
  }
}

export interface ChannelAccountSnapshot {
  accountId: string
  name?: string
  enabled?: boolean
  configured?: boolean
  linked?: boolean
  running?: boolean
  connected?: boolean
  lastConnectedAt?: number
  lastError?: string
  lastStartAt?: number
  lastStopAt?: number
  lastInboundAt?: number
  lastOutboundAt?: number
  busy?: boolean
  activeRuns?: number
  lastRunActivityAt?: number
  mode?: string
  dmPolicy?: string
  allowFrom?: string[]
  probe?: { ok: boolean; error?: string; [key: string]: unknown }
  lastProbeAt?: number
  audit?: unknown
  application?: unknown
  [key: string]: unknown
}

export interface ChannelStatusResult {
  ts: number
  channelOrder: string[]
  channelLabels: Record<string, string>
  channelDetailLabels?: Record<string, string>
  channelSystemImages?: Record<string, string>
  channelMeta?: Array<{ id: string; label: string; detailLabel?: string; systemImage?: string }>
  channels: Record<string, unknown>
  channelAccounts: Record<string, ChannelAccountSnapshot[]>
  channelDefaultAccountId: Record<string, string>
}

export interface ChannelSummary {
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
  accounts: ChannelAccountSnapshot[]
  capabilities: ChannelCapabilities
  actions: ChannelActionFlags
  lastError?: string
}

export interface ChannelDetailPayload {
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
  pairing: {
    supported: boolean
    pending: PairingRequest[]
    allowFrom: string[]
  }
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

export interface ChannelAuthSession {
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

export type ChannelSectionKey =
  | 'overview'
  | 'setup'
  | 'accounts'
  | 'config'
  | 'access'
  | 'diagnostics'

export interface TelegramChannelConfig {
  enabled?: boolean
  botToken?: string
  name?: string
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled'
  allowFrom?: Array<string | number>
  groupPolicy?: 'open' | 'disabled' | 'allowlist'
  streaming?: 'off' | 'partial' | 'block' | 'progress'
  historyLimit?: number
  dmHistoryLimit?: number
}

export interface SlackChannelConfig {
  enabled?: boolean
  botToken?: string
  appToken?: string
  name?: string
  mode?: 'socket' | 'http'
  signingSecret?: string
  dmPolicy?: 'pairing' | 'allowlist' | 'open' | 'disabled'
  allowFrom?: Array<string | number>
  groupPolicy?: 'open' | 'disabled' | 'allowlist'
  requireMention?: boolean
  streaming?: 'off' | 'partial' | 'block' | 'progress'
  historyLimit?: number
  dmHistoryLimit?: number
}

export interface FeishuChannelConfig {
  enabled?: boolean
  appId?: string
  appSecret?: string
  encryptKey?: string
  verificationToken?: string
  domain?: 'feishu' | 'lark'
  connectionMode?: 'websocket' | 'webhook'
  name?: string
  dmPolicy?: 'open' | 'pairing' | 'allowlist'
  allowFrom?: Array<string | number>
  groupPolicy?: 'open' | 'allowlist' | 'disabled'
  requireMention?: boolean
  streaming?: boolean
  historyLimit?: number
  dmHistoryLimit?: number
}

// ── Model Types ──

export interface ModelOption {
  value: string
  label: string
  category?: string
}
