// ============================================================================
// Provider Types
// ============================================================================

export type ProviderType = 'openclaw'
export type UpstreamProviderType = 'commonstack' | 'custom'
export type CustomProviderCompatibility = 'openai' | 'anthropic'

export interface ProviderConfig {
  provider: ProviderType
  apiKey: string
  model: string
  baseUrl?: string
}

// ============================================================================
// Config Types
// ============================================================================

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

export interface AppConfig {
  providers: {
    currentProvider: ProviderType
    openclaw: OpenClawProviderConfig
  }
  workspaceDir: string
  envMode?: 'portable' | 'system'
  meta?: {
    lastTouchedAt?: string
  }
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatRequest {
  sessionKey: string
  prompt: string
  thinking?: string
}

export interface AgentEvent {
  type: string
  content?: string
  name?: string
  toolCallId?: string
  args?: any
  result?: string
  error?: string
  [key: string]: any
}

// ============================================================================
// SSE Event Types
// ============================================================================

export interface SSEEvent {
  type: string
  content?: string
  name?: string
  toolCallId?: string
  data?: any
  result?: any
  message?: string
  error?: any
}
