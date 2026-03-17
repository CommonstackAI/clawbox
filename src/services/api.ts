import type {
  AgentSummary,
  AgentConfig,
  SessionMessage,
  ClawboxConfig,
  ModelOption,
  CronJob,
  CronStatus,
  CronRunLogEntry,
  SoulFile,
  SoulTemplate,
  ChannelStatusResult,
  PairingRequest,
  CustomProviderCompatibility,
  ChannelCatalogItem,
  ChannelDetailPayload,
  ChannelSummary,
  ChannelAuthSession,
  SkillStatusReport,
  ClawhubCliStatus,
  ClawhubAuthStatus,
  ClawhubSearchItem,
  ManualSkillImportSource,
} from '@/types'

const GATEWAY_URL = 'http://127.0.0.1:13000'

type ApiErrorPayload = {
  error?: string
  code?: string
  retryAfterSeconds?: number
}

export class ApiError extends Error {
  status: number
  code?: string
  retryAfterSeconds?: number

  constructor(
    message: string,
    options: {
      status: number
      code?: string
      retryAfterSeconds?: number
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

function parseApiErrorPayload(text: string): ApiErrorPayload | null {
  if (!text.trim()) return null

  try {
    const parsed = JSON.parse(text) as ApiErrorPayload
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

async function throwApiError(res: Response): Promise<never> {
  const text = await res.text()
  const payload = parseApiErrorPayload(text)
  throw new ApiError(
    payload?.error || text || `${res.status} ${res.statusText}`,
    {
      status: res.status,
      code: typeof payload?.code === 'string' ? payload.code : undefined,
      retryAfterSeconds: typeof payload?.retryAfterSeconds === 'number'
        ? payload.retryAfterSeconds
        : undefined,
    },
  )
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`)
  if (!res.ok) await throwApiError(res)
  return res.json()
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwApiError(res)
  return res.json()
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${GATEWAY_URL}${path}`, { method: 'DELETE' })
  if (!res.ok) await throwApiError(res)
}

export const agentsApi = {
  list: () => apiGet<{ agents: AgentSummary[]; defaultAgentId?: string }>('/api/agents'),
  get: (id: string) => apiGet<{ config: AgentConfig; effectiveConfig: AgentConfig }>(`/api/agents/${id}`),
  create: (data: Partial<AgentConfig>) => apiPost<{ success: boolean }>('/api/agents', data),
  update: (id: string, data: Partial<AgentConfig>) => apiPatch<{ success: boolean }>(`/api/agents/${id}`, data),
  delete: (id: string) => apiDelete(`/api/agents/${id}`),
}

export const sessionsApi = {
  list: () => apiGet<{ sessions: any[]; total: number }>('/api/sessions'),
  get: (id: string) => apiGet<{ metadata: any; messageCount: number }>(`/api/sessions/${id}`),
  messages: (id: string) => apiGet<{ messages: any[] }>(`/api/sessions/${id}/messages`),
  delete: (id: string) => apiDelete(`/api/sessions/${id}`),
  reset: (id: string) => apiPost<{ success: boolean }>(`/api/sessions/${id}/reset`),
  compact: (id: string) => apiPost<{ success: boolean }>(`/api/sessions/${id}/compact`),
}

export const configApi = {
  get: () => apiGet<{ config: ClawboxConfig }>('/api/config'),
  patch: (data: Partial<ClawboxConfig>) => apiPatch<{ success: boolean; config: ClawboxConfig }>('/api/config', data),
}

export const modelsApi = {
  list: () => apiGet<{ models: any[] }>('/api/models'),
}

export const openclawApi = {
  check: (gatewayUrl: string) =>
    apiGet<{
      ok: boolean
      models: any[]
      config?: { defaultModel?: string; activeProviderId?: string; activeProviderBaseUrl?: string }
      error?: string
    }>(
      `/api/config/providers/openclaw/check?gatewayUrl=${encodeURIComponent(gatewayUrl)}`
    ),
  sessions: (gatewayUrl: string) =>
    apiGet<{ ok: boolean; sessions?: any[]; error?: string }>(
      `/api/config/providers/openclaw/sessions?gatewayUrl=${encodeURIComponent(gatewayUrl)}`
    ),
  history: (gatewayUrl: string, sessionKey: string) =>
    apiGet<{ ok: boolean; messages?: any[]; error?: string }>(
      `/api/config/providers/openclaw/sessions/${encodeURIComponent(sessionKey)}/history?gatewayUrl=${encodeURIComponent(gatewayUrl)}`
    ),
  deleteSession: (gatewayUrl: string, sessionKey: string) =>
    apiDelete(`/api/config/providers/openclaw/sessions/${encodeURIComponent(sessionKey)}?gatewayUrl=${encodeURIComponent(gatewayUrl)}`),
  resetSession: (gatewayUrl: string, sessionKey: string) =>
    apiPost<{ ok: boolean }>(`/api/config/providers/openclaw/sessions/${encodeURIComponent(sessionKey)}/reset?gatewayUrl=${encodeURIComponent(gatewayUrl)}`),
  patchConfig: (gatewayUrl: string, body: Record<string, any>) =>
    apiPatch<{ ok: boolean; config?: any }>(`/api/config/providers/openclaw/config?gatewayUrl=${encodeURIComponent(gatewayUrl)}`, body),
}

export const healthApi = {
  status: () => apiGet<{ status: string; gatewayConnected: boolean; timestamp: number }>('/api/health'),
  check: async (): Promise<boolean> => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/health`)
      return res.ok
    } catch { return false }
  },
  checkGateway: async (gatewayUrl: string): Promise<boolean> => {
    try {
      // Use the clawbox backend to check gateway connectivity via models.list
      const res = await fetch(`${GATEWAY_URL}/api/config/providers/openclaw/check?gatewayUrl=${encodeURIComponent(gatewayUrl)}`)
      if (!res.ok) return false
      const data = await res.json()
      return data.ok === true
    } catch { return false }
  },
}

export const titlesApi = {
  getAll: () => apiGet<{ titles: Record<string, string> }>('/api/titles'),
  set: (id: string, title: string) => apiPut<{ success: boolean }>(`/api/titles/${encodeURIComponent(id)}`, { title }),
  delete: (id: string) => apiDelete(`/api/titles/${encodeURIComponent(id)}`),
  generate: (sessionId: string, message: string) =>
    apiPost<{ title: string }>('/api/titles/generate', { sessionId, message }),
  getSuggestions: (lang?: string) =>
    apiPost<{ suggestions: string[] }>('/api/titles/suggestions', { lang }),
}

export const toolsApi = {
  generateSummary: (toolName: string, args: Record<string, unknown>) =>
    apiPost<{ success: boolean; summary: string }>('/api/tools/generate-summary', { toolName, args }),
  getSummaries: (sessionKey: string) =>
    apiGet<{ summaries: Record<string, { summary: string; toolName?: string; updatedAt: number }> }>(
      `/api/tools/summaries/${encodeURIComponent(sessionKey)}`
    ),
  saveSummary: (sessionKey: string, toolCallId: string, summary: string, toolName?: string) =>
    apiPost<{ success: boolean }>('/api/tools/summaries', { sessionKey, toolCallId, summary, toolName }),
}

export const skillsApi = {
  status: (agentId?: string) =>
    apiGet<SkillStatusReport>(`/api/skills${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`),
  update: (data: { skillKey: string; enabled?: boolean; apiKey?: string; env?: Record<string, string> }) =>
    apiPatch<{ ok: boolean; skillKey: string; config: Record<string, unknown> }>('/api/skills', data),
  install: (data: { skillKey: string; name: string; installId: string; timeoutMs?: number }) =>
    apiPost<{ ok?: boolean; message?: string }>('/api/skills/install', data),
  marketStatus: () =>
    apiGet<ClawhubCliStatus>('/api/skills/market/status'),
  marketAuthStatus: () =>
    apiGet<ClawhubAuthStatus>('/api/skills/market/auth/status'),
  installClawhubCli: (lang?: string) =>
    apiPost<ClawhubCliStatus>('/api/skills/market/cli/install', lang ? { lang } : {}),
  loginClawhub: (data: { token: string; lang?: string }) =>
    apiPost<ClawhubAuthStatus>('/api/skills/market/auth/login', data),
  loginClawhubInBrowser: (data?: { lang?: string; label?: string }) =>
    apiPost<ClawhubAuthStatus>('/api/skills/market/auth/login/browser', data ?? {}),
  logoutClawhub: (lang?: string) =>
    apiPost<ClawhubAuthStatus>('/api/skills/market/auth/logout', lang ? { lang } : {}),
  marketSearch: (query: string, limit = 12) =>
    apiGet<{ results: ClawhubSearchItem[] }>(
      `/api/skills/market/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  marketInstall: (data: { slug: string; version?: string; lang?: string; force?: boolean }) =>
    apiPost<{ ok: true; message: string }>('/api/skills/market/install', data),
  manualImport: (data: { source: ManualSkillImportSource; value: string; overwrite?: boolean }) =>
    apiPost<{ ok: true; skillName: string; importedPath: string }>('/api/skills/manual/import', data),
}

export const soulApi = {
  get: () => apiGet<SoulFile>('/api/soul'),
  save: (content: string) => apiPut<{ success: boolean }>('/api/soul', { content }),
  templates: () => apiGet<{ templates: SoulTemplate[] }>('/api/soul/templates'),
  createTemplate: (data: { name: string; icon: string; description: string; content: string }) =>
    apiPost<{ success: boolean; template: SoulTemplate }>('/api/soul/templates', data),
  updateTemplate: (id: string, data: Partial<{ name: string; icon: string; description: string; content: string }>) =>
    apiPut<{ success: boolean; template: SoulTemplate }>(`/api/soul/templates/${encodeURIComponent(id)}`, data),
  deleteTemplate: (id: string) => apiDelete(`/api/soul/templates/${encodeURIComponent(id)}`),
}

export const cronApi = {
  status: () => apiGet<CronStatus>('/api/cron/status'),
  list: () => apiGet<{ jobs: CronJob[] }>('/api/cron/jobs'),
  add: (job: Omit<CronJob, 'id' | 'createdAtMs' | 'updatedAtMs' | 'state'>) =>
    apiPost<{ success: boolean }>('/api/cron/jobs', job),
  update: (id: string, patch: Partial<CronJob>) =>
    apiPatch<{ success: boolean }>(`/api/cron/jobs/${encodeURIComponent(id)}`, patch),
  remove: (id: string) => apiDelete(`/api/cron/jobs/${encodeURIComponent(id)}`),
  run: (id: string) => apiPost<{ success: boolean }>(`/api/cron/jobs/${encodeURIComponent(id)}/run`),
  runs: (id: string) => apiGet<{ entries: CronRunLogEntry[] }>(`/api/cron/jobs/${encodeURIComponent(id)}/runs`),
  channels: () => apiGet<{ channels: { id: string; label: string }[] }>('/api/cron/channels'),
}

export const onboardApi = {
  status: () => apiGet<{ needed: boolean }>('/api/onboard/status'),
  envStatus: () => apiGet<{
    allReady: boolean
    status?: 'ready' | 'warning' | 'not_ready'
    mode?: 'portable' | 'system'
    gatewayConnected?: boolean
    nodeVersion?: string | null
    nodeTargetVersion?: string | null
    nodeSource?: 'system' | 'portable' | null
    nodeSupported?: boolean
    openclawVersion?: string | null
    debug?: {
      gatewayLines: string[]
      nodeLines: string[]
      openclawLines: string[]
    }
    nvm: { installed: boolean; version?: string }
    node: { installed: boolean; version?: string; supported?: boolean }
    registry: { configured: boolean; current?: string }
    openclaw: { installed: boolean; version?: string }
  }>('/api/onboard/env-status'),
  envSetup: (body: { lang: string; mode: 'portable' | 'system' }) =>
    fetch(`${GATEWAY_URL}/api/onboard/env-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  models: (
    baseUrl: string,
    apiKey: string,
    customCompatibility?: CustomProviderCompatibility,
  ) =>
    apiPost<{ models: string[] }>('/api/onboard/models', { baseUrl, apiKey, customCompatibility }),
  run: (body: {
    providerType: 'commonstack' | 'custom'
    baseUrl: string
    apiKey: string
    customCompatibility?: CustomProviderCompatibility
    defaultModel?: string
    lang: string
  }) =>
    fetch(`${GATEWAY_URL}/api/onboard/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  openclawVersionCheck: (mode?: 'portable' | 'system' | 'auto') =>
    apiGet<{ status: 'ok' | 'not_installed' | 'outdated' | 'newer'; installed?: string; target: string }>(
      `/api/onboard/openclaw-version-check${mode ? `?mode=${encodeURIComponent(mode)}` : ''}`
    ),
  resolveOpenclawVersion: (body: { action: 'continue' | 'reinstall'; lang?: string }) =>
    apiPost<{ success: boolean; version?: string; message?: string; error?: string }>('/api/onboard/env-setup/resolve-openclaw-version', body),
}

export const channelsApi = {
  status: (probe = false) =>
    apiGet<ChannelStatusResult>(probe ? '/api/channels/status/probe' : '/api/channels/status'),
  getConfig: (channelId: string) =>
    apiGet<{ config: Record<string, any> }>(`/api/channels/config/${channelId}`),
  updateConfig: (channelId: string, data: Record<string, any>) =>
    apiPatch<{ success: boolean; result: any }>(`/api/channels/config/${channelId}`, data),
  logout: (channelId: string, accountId?: string) =>
    apiPost<{ success: boolean }>(`/api/channels/logout/${channelId}`, accountId ? { accountId } : {}),
  pairingRequests: (channelId: string) =>
    apiGet<{ requests: PairingRequest[] }>(`/api/channels/pairing/${channelId}`),
  approvePairing: (channelId: string, code: string) =>
    apiPost<{ success: boolean; id: string }>(`/api/channels/pairing/${channelId}/approve`, { code }),
  allowFrom: (channelId: string) =>
    apiGet<{ allowFrom: string[] }>(`/api/channels/pairing/${channelId}/allowFrom`),
}

export const channelsFacadeApi = {
  catalog: () =>
    apiGet<{ items: ChannelCatalogItem[]; generatedAt: number }>('/api/channels/catalog'),
  list: () =>
    apiGet<{ items: ChannelSummary[]; ts: number; gatewayError?: string }>('/api/channels'),
  detail: (channelId: string) =>
    apiGet<ChannelDetailPayload>(`/api/channels/${encodeURIComponent(channelId)}`),
  schema: (channelId: string) =>
    apiGet<{ schema: Record<string, unknown> | null; uiHints: Record<string, unknown> | null }>(
      `/api/channels/${encodeURIComponent(channelId)}/schema`
    ),
  probe: (channelId: string) =>
    apiPost<{ success: boolean; summary: ChannelSummary | null }>(
      `/api/channels/${encodeURIComponent(channelId)}/actions/probe`
    ),
  enable: (channelId: string, accountId?: string) =>
    apiPost<{ success: boolean }>(
      `/api/channels/${encodeURIComponent(channelId)}/actions/enable`,
      accountId ? { accountId } : {}
    ),
  disable: (channelId: string, accountId?: string) =>
    apiPost<{ success: boolean }>(
      `/api/channels/${encodeURIComponent(channelId)}/actions/disable`,
      accountId ? { accountId } : {}
    ),
  activate: (channelId: string) =>
    apiPost<{ success: boolean; activated: boolean; summary: ChannelSummary | null }>(
      `/api/channels/${encodeURIComponent(channelId)}/actions/activate`
    ),
  logout: (channelId: string, accountId?: string) =>
    apiPost<{ success: boolean }>(
      `/api/channels/${encodeURIComponent(channelId)}/actions/logout`,
      accountId ? { accountId } : {}
    ),
  startAuth: (channelId: string, body?: { accountId?: string; force?: boolean; timeoutMs?: number }) =>
    apiPost<ChannelAuthSession>(`/api/channels/${encodeURIComponent(channelId)}/auth/start`, body ?? {}),
  pollAuth: (channelId: string, sessionId: string) =>
    apiGet<ChannelAuthSession>(
      `/api/channels/${encodeURIComponent(channelId)}/auth/session/${encodeURIComponent(sessionId)}`
    ),
  cancelAuth: (channelId: string, sessionId: string) =>
    apiPost<ChannelAuthSession>(`/api/channels/${encodeURIComponent(channelId)}/auth/cancel`, { sessionId }),
}

export { GATEWAY_URL }
