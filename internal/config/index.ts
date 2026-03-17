import { existsSync, readFileSync, writeFileSync, mkdirSync, watchFile } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import JSON5 from 'json5'
import { createLogger } from '../logger'
import type { AppConfig, CustomProviderCompatibility, UpstreamProviderType } from '../types/index'
import {
  GATEWAY_PLIST,
  GATEWAY_PORT,
  GATEWAY_SYSTEMD_UNIT,
  GATEWAY_TASK_SCRIPT,
  OPENCLAW_CONFIG,
} from '../onboard/constants'

const log = createLogger('Config')

const WRAPPERBOX_HOME = process.env.CLAWBOX_HOME || join(homedir(), '.wrapperbox')
const CONFIG_FILE = join(WRAPPERBOX_HOME, 'config.json5')
const DEFAULT_COMMONSTACK_BASE_URL = 'https://apibot.lingsucloud.cn/v1'
const DEFAULT_CUSTOM_PROVIDER_ID = 'custom-provider'
const DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY: CustomProviderCompatibility = 'openai'
const DEFAULT_WORKSPACE_DIR = join(homedir(), '.openclaw', 'workspace')

type LocalAppConfig = {
  envMode?: 'portable' | 'system'
  meta?: {
    lastTouchedAt?: string
  }
}

const DEFAULT_LOCAL_CONFIG: LocalAppConfig = {}

let currentLocalConfig: LocalAppConfig = { ...DEFAULT_LOCAL_CONFIG }

export function getWrapperboxHome(): string {
  return WRAPPERBOX_HOME
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function loadConfig(): AppConfig {
  try {
    if (!existsSync(WRAPPERBOX_HOME)) {
      mkdirSync(WRAPPERBOX_HOME, { recursive: true })
    }

    let rewriteLocalConfig = false
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, 'utf-8')
      const parsed = JSON5.parse(raw)
      currentLocalConfig = sanitizeLocalConfig(parsed)
      rewriteLocalConfig = JSON5.stringify(parsed, null, 2) !== JSON5.stringify(currentLocalConfig, null, 2)
    } else {
      currentLocalConfig = { ...DEFAULT_LOCAL_CONFIG }
    }

    if (rewriteLocalConfig) {
      saveLocalConfig(currentLocalConfig)
    }

    log.info(`Config loaded from ${CONFIG_FILE}`)
  } catch (e: any) {
    log.error(`Failed to load config: ${e.message}`)
    currentLocalConfig = { ...DEFAULT_LOCAL_CONFIG }
  }

  return buildAppConfig(currentLocalConfig)
}

export function getConfig(): AppConfig {
  return buildAppConfig(currentLocalConfig)
}

export function patchConfig(patch: Partial<AppConfig>): AppConfig {
  const localPatch = extractLocalPatch(patch)
  currentLocalConfig = deepMerge(currentLocalConfig, localPatch) as LocalAppConfig

  if ('envMode' in localPatch && localPatch.envMode === undefined) {
    delete currentLocalConfig.envMode
  }

  currentLocalConfig.meta = {
    ...currentLocalConfig.meta,
    lastTouchedAt: new Date().toISOString(),
  }
  saveLocalConfig(currentLocalConfig)
  return getConfig()
}

export function saveConfig(config: Partial<AppConfig>): void {
  currentLocalConfig = sanitizeLocalConfig(config)
  saveLocalConfig(currentLocalConfig)
}

export function startConfigWatcher(): void {
  if (!existsSync(CONFIG_FILE)) return
  watchFile(CONFIG_FILE, { interval: 2000 }, () => {
    log.info('Config file changed, reloading...')
    loadConfig()
  })
}

function buildAppConfig(localConfig: LocalAppConfig): AppConfig {
  const openclawConfig = readOpenclawConfig()

  return {
    providers: buildOpenclawProviderState(openclawConfig),
    workspaceDir: resolveWorkspaceDir(openclawConfig),
    envMode: localConfig.envMode,
    meta: localConfig.meta,
  }
}

function buildOpenclawProviderState(openclawConfig: any): AppConfig['providers'] {
  const gatewayUrl = resolveGatewayUrl(openclawConfig)
  const defaultModel = resolveDefaultModelRef(openclawConfig)
  const activeProviderId = getProviderIdFromModelRef(defaultModel)
  const providerConfigs = isRecord(openclawConfig?.models?.providers) ? openclawConfig.models.providers : {}
  const activeProviderType: UpstreamProviderType =
    activeProviderId && activeProviderId !== 'commonstack' ? 'custom' : 'commonstack'

  const commonstackProvider = isRecord(providerConfigs.commonstack) ? providerConfigs.commonstack : {}
  const customProviderId = resolveCustomProviderId(providerConfigs, activeProviderId)
  const customProvider = isRecord(providerConfigs[customProviderId]) ? providerConfigs[customProviderId] : {}
  const activeProviderConfig = activeProviderId && isRecord(providerConfigs[activeProviderId])
    ? providerConfigs[activeProviderId]
    : {}

  return {
    currentProvider: 'openclaw',
    openclaw: {
      apiKey: '',
      baseUrl: gatewayUrl,
      models: resolveProviderModelRefs(openclawConfig, activeProviderId),
      defaultModel,
      upstream: {
        active: activeProviderType,
        commonstack: {
          baseUrl: stringOrDefault(commonstackProvider.baseUrl, DEFAULT_COMMONSTACK_BASE_URL),
          apiKey: stringOrDefault(
            commonstackProvider.apiKey,
            stringOrDefault(openclawConfig?.tools?.web?.search?.apiKey, ''),
          ),
        },
        custom: {
          baseUrl: stringOrDefault(customProvider.baseUrl, ''),
          apiKey: stringOrDefault(customProvider.apiKey, ''),
          providerId: customProviderId,
          compatibility: resolveCustomCompatibility(
            customProvider.api ?? activeProviderConfig.api,
          ),
        },
      },
    },
  }
}

function resolveProviderModelRefs(openclawConfig: any, providerId: string): string[] {
  if (!providerId) return []

  const providerConfig = openclawConfig?.models?.providers?.[providerId]
  const providerModels = normalizeModelIds(providerConfig?.models)
  if (providerModels.length > 0) {
    return providerModels.map((modelId) => `${providerId}/${modelId}`)
  }

  const configuredModels = isRecord(openclawConfig?.agents?.defaults?.models)
    ? Object.keys(openclawConfig.agents.defaults.models)
    : []

  return configuredModels
    .filter((modelRef) => modelRef.startsWith(`${providerId}/`))
    .sort((a, b) => a.localeCompare(b))
}

function resolveDefaultModelRef(openclawConfig: any): string {
  const candidates = [
    openclawConfig?.agents?.defaults?.model?.primary,
    typeof openclawConfig?.agents?.defaults?.model === 'string' ? openclawConfig.agents.defaults.model : undefined,
    openclawConfig?.agent?.model,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ''
}

function resolveCustomProviderId(providerConfigs: Record<string, any>, activeProviderId: string): string {
  if (activeProviderId && activeProviderId !== 'commonstack') {
    return activeProviderId
  }

  const customProviderId = Object.keys(providerConfigs)
    .map((providerId) => providerId.trim())
    .find((providerId) => providerId && providerId !== 'commonstack')

  return customProviderId || DEFAULT_CUSTOM_PROVIDER_ID
}

function resolveCustomCompatibility(providerApi: unknown): CustomProviderCompatibility {
  return providerApi === 'anthropic-messages' ? 'anthropic' : DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY
}

function resolveWorkspaceDir(openclawConfig: any): string {
  const configuredWorkspace = openclawConfig?.agents?.defaults?.workspace
  return typeof configuredWorkspace === 'string' && configuredWorkspace.trim()
    ? configuredWorkspace.trim()
    : DEFAULT_WORKSPACE_DIR
}

function resolveGatewayUrl(openclawConfig: any): string {
  if (typeof process.env.OPENCLAW_GATEWAY_URL === 'string' && process.env.OPENCLAW_GATEWAY_URL.trim()) {
    return process.env.OPENCLAW_GATEWAY_URL.trim()
  }

  const port = typeof openclawConfig?.gateway?.port === 'number' && Number.isFinite(openclawConfig.gateway.port)
    ? openclawConfig.gateway.port
    : GATEWAY_PORT

  const token = resolveGatewayToken(openclawConfig)
  return token
    ? `http://127.0.0.1:${port}/v1?token=${token}`
    : `http://127.0.0.1:${port}/v1`
}

function resolveGatewayToken(openclawConfig: any): string {
  const configuredMode = openclawConfig?.gateway?.auth?.mode
  const configuredToken = typeof openclawConfig?.gateway?.auth?.token === 'string'
    ? openclawConfig.gateway.auth.token.trim()
    : ''

  if ((configuredMode === 'token' || !configuredMode) && configuredToken) {
    return configuredToken
  }

  const serviceToken = extractTokenFromServiceFile()
  if (serviceToken) return serviceToken

  return process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || ''
}

function extractTokenFromServiceFile(): string | undefined {
  if (process.platform === 'darwin') {
    if (!existsSync(GATEWAY_PLIST)) return undefined
    try {
      const content = readFileSync(GATEWAY_PLIST, 'utf-8')
      const match = content.match(/OPENCLAW_GATEWAY_TOKEN<\/key>\s*<string>([^<]{8,})<\/string>/i)
      return match?.[1]?.trim()
    } catch {
      return undefined
    }
  }

  if (process.platform === 'linux') {
    if (!existsSync(GATEWAY_SYSTEMD_UNIT)) return undefined
    try {
      const content = readFileSync(GATEWAY_SYSTEMD_UNIT, 'utf-8')
      const match = content.match(/^Environment="?OPENCLAW_GATEWAY_TOKEN=([^"\r\n]+)/m)
      return match?.[1]?.trim()
    } catch {
      return undefined
    }
  }

  if (process.platform === 'win32') {
    if (!existsSync(GATEWAY_TASK_SCRIPT)) return undefined
    try {
      const content = readFileSync(GATEWAY_TASK_SCRIPT, 'utf-8')
      const match = content.match(/^set\s+"?OPENCLAW_GATEWAY_TOKEN=([^"\r\n]+)/mi)
      return match?.[1]?.trim().replace(/"+$/, '')
    } catch {
      return undefined
    }
  }

  return undefined
}

function readOpenclawConfig(): Record<string, any> {
  try {
    if (!existsSync(OPENCLAW_CONFIG)) {
      return {}
    }

    const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    const parsed = JSON5.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch (e: any) {
    log.warn(`Failed to read OpenClaw config: ${e.message}`)
    return {}
  }
}

function saveLocalConfig(config: LocalAppConfig): void {
  try {
    if (!existsSync(WRAPPERBOX_HOME)) {
      mkdirSync(WRAPPERBOX_HOME, { recursive: true })
    }

    if (Object.keys(config).length === 0) {
      currentLocalConfig = config
      if (existsSync(CONFIG_FILE)) {
        writeFileSync(CONFIG_FILE, '{}\n', 'utf-8')
      }
      return
    }

    writeFileSync(CONFIG_FILE, JSON5.stringify(config, null, 2), 'utf-8')
    currentLocalConfig = config
    log.info('Config saved')
  } catch (e: any) {
    log.error(`Failed to save config: ${e.message}`)
  }
}

function sanitizeLocalConfig(raw: unknown): LocalAppConfig {
  const config = isRecord(raw) ? raw : {}
  const sanitized: LocalAppConfig = {}

  if (config.envMode === 'portable' || config.envMode === 'system') {
    sanitized.envMode = config.envMode
  }

  if (isRecord(config.meta) && typeof config.meta.lastTouchedAt === 'string' && config.meta.lastTouchedAt.trim()) {
    sanitized.meta = { lastTouchedAt: config.meta.lastTouchedAt.trim() }
  }

  return sanitized
}

function extractLocalPatch(patch: Partial<AppConfig>): LocalAppConfig {
  const next: LocalAppConfig = {}

  if ('envMode' in patch) {
    next.envMode = patch.envMode === 'portable' || patch.envMode === 'system'
      ? patch.envMode
      : undefined
  }

  if ('meta' in patch && isRecord(patch.meta) && typeof patch.meta.lastTouchedAt === 'string') {
    next.meta = { lastTouchedAt: patch.meta.lastTouchedAt }
  }

  return next
}

function normalizeModelIds(rawModels: unknown): string[] {
  if (!Array.isArray(rawModels)) return []

  return rawModels
    .map((model) => {
      if (typeof model === 'string') return model.trim()
      if (isRecord(model) && typeof model.id === 'string') return model.id.trim()
      return ''
    })
    .filter(Boolean)
}

function getProviderIdFromModelRef(modelRef: string): string {
  const slashIndex = modelRef.indexOf('/')
  if (slashIndex <= 0) return ''
  return modelRef.slice(0, slashIndex)
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}
