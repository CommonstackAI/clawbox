import type {
  ClawboxConfig,
  CustomProviderCompatibility,
  UpstreamProviderType,
} from '@/types'

export const COMMONSTACK_NODE_OPTIONS = [
  { label: '亚洲节点 (Asia)', labelEn: 'Asia Node', url: 'https://apibot.lingsucloud.cn/v1' },
  { label: '全球节点 (Global)', labelEn: 'Global Node', url: 'https://api.commonstack.ai/v1' },
] as const

export const DEFAULT_COMMONSTACK_BASE_URL = COMMONSTACK_NODE_OPTIONS[0].url
export const CUSTOM_PROVIDER_ID = 'custom-provider'
export const DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY: CustomProviderCompatibility = 'openai'

export function isCommonstackBaseUrl(baseUrl?: string | null): boolean {
  const normalized = baseUrl?.trim().replace(/\/+$/, '') || ''
  return COMMONSTACK_NODE_OPTIONS.some(option => option.url.replace(/\/+$/, '') === normalized)
}

export function requiresAkPrefixedApiKey(
  providerType: UpstreamProviderType,
  baseUrl?: string | null,
): boolean {
  return providerType === 'commonstack' && isCommonstackBaseUrl(baseUrl)
}

export function normalizeCustomProviderCompatibility(
  compatibility?: string | null,
): CustomProviderCompatibility {
  return compatibility === 'anthropic' ? 'anthropic' : DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY
}

export function normalizeCustomProviderBaseUrl(
  baseUrl?: string | null,
  compatibility: CustomProviderCompatibility = DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
): string {
  const normalized = baseUrl?.trim().replace(/\/+$/, '') || ''
  if (compatibility === 'anthropic') {
    return normalized.replace(/\/v1$/i, '')
  }
  return normalized
}

export function resolveProviderApi(
  providerType: UpstreamProviderType,
  compatibility: CustomProviderCompatibility = DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
): 'openai-completions' | 'anthropic-messages' {
  return providerType === 'custom' && compatibility === 'anthropic'
    ? 'anthropic-messages'
    : 'openai-completions'
}

export function getCustomProviderBaseUrlPlaceholder(
  compatibility: CustomProviderCompatibility,
): string {
  return compatibility === 'anthropic'
    ? 'https://your-anthropic-compatible-endpoint'
    : 'https://your-openai-compatible-endpoint/v1'
}

export function getCustomProviderApiKeyPlaceholder(
  compatibility: CustomProviderCompatibility,
): string {
  return compatibility === 'anthropic' ? 'sk-ant-...' : 'sk-...'
}

export function getModelRefProviderId(modelRef?: string | null): string {
  const trimmed = modelRef?.trim() || ''
  const slashIndex = trimmed.indexOf('/')
  if (slashIndex <= 0) {
    return ''
  }
  return trimmed.slice(0, slashIndex)
}

export function stripModelRefProvider(modelRef?: string | null): string {
  const trimmed = modelRef?.trim() || ''
  const slashIndex = trimmed.indexOf('/')
  if (slashIndex === -1) {
    return trimmed
  }
  return trimmed.slice(slashIndex + 1)
}

export function inferUpstreamProviderType(providerId?: string | null): UpstreamProviderType {
  return providerId?.trim() === 'commonstack' ? 'commonstack' : 'custom'
}

export function getActiveUpstreamProviderType(
  config?: ClawboxConfig | null,
): UpstreamProviderType {
  const explicit = config?.providers?.openclaw?.upstream?.active
  if (explicit === 'commonstack' || explicit === 'custom') {
    return explicit
  }
  return inferUpstreamProviderType(getModelRefProviderId(config?.providers?.openclaw?.defaultModel))
}

export function getActiveUpstreamProviderId(config?: ClawboxConfig | null): string {
  const activeType = getActiveUpstreamProviderType(config)
  if (activeType === 'commonstack') {
    return 'commonstack'
  }
  return config?.providers?.openclaw?.upstream?.custom?.providerId?.trim() || CUSTOM_PROVIDER_ID
}

export function buildModelRef(providerId: string, modelId: string): string {
  return `${providerId.trim()}/${modelId.trim()}`
}
