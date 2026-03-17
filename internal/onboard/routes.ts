import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { patchConfig, getConfig } from '../config/index'
import { openclawRpc, openclawGetClient } from '../providers/openclaw-rpc'
import compatibility from '../compatibility.json'
import { plat, CMD_EXE, getNodePlatformArch } from './platform'
import { execAsync, compareVersions, log } from './utils'
import { TARGET_OPENCLAW_VERSION, OPENCLAW_CONFIG, GATEWAY_PORT } from './constants'
import { refreshWindowsPath } from './windows-env'
import {
  findOpenclawBin,
  checkNpmRegistry,
  checkOpenclawInstalled,
  listSystemOpenclawCandidatePaths,
  resolvePortableOpenclawLaunch,
  runOpenclawCmd,
  type OpenclawResolveMode,
} from './openclaw-bin'
import {
  killPort, isPortListening, restartGateway, ensureGatewayWindows, waitForGatewayPort,
  syncGatewayUrl, syncTokenFromServiceFile, ensureGatewayMode,
} from './gateway'
import {
  detectNodeRuntime, detectPortableNode, extractPortableNode,
  getPortableRuntimeDir, getPortableRuntimeManifestPath, readPortableRuntimeManifest, type NodeRuntime,
} from './node-runtime'
import { checkOnboardNeeded, readOnboardState, writeOnboardState } from './onboard-state'

export const onboardRoutes = new Hono()
const TARGET_NODE_VERSION = (compatibility as any).node.targetVersion as string
const DEFAULT_COMMONSTACK_BASE_URL = 'https://apibot.lingsucloud.cn/v1'
const COMMONSTACK_BASE_URLS = new Set([
  'https://apibot.lingsucloud.cn/v1',
  'https://api.commonstack.ai/v1',
])
const DEFAULT_CUSTOM_PROVIDER_ID = 'custom-provider'
const DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY = 'openai'
const ANTHROPIC_VERSION_HEADER = '2023-06-01'

type UpstreamProviderType = 'commonstack' | 'custom'
type CustomProviderCompatibility = 'openai' | 'anthropic'
type CustomProviderApi = 'openai-completions' | 'anthropic-messages'

function normalizeBaseUrl(baseUrl?: string | null): string {
  return baseUrl?.trim().replace(/\/+$/, '') || ''
}

function normalizeCustomProviderCompatibility(
  compatibility?: string | null,
): CustomProviderCompatibility {
  return compatibility === 'anthropic' ? 'anthropic' : DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY
}

function stripTrailingV1(baseUrl: string): string {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

function normalizeProviderBaseUrl(params: {
  providerType: UpstreamProviderType
  baseUrl: string
  customCompatibility?: CustomProviderCompatibility
}): string {
  if (params.providerType === 'custom' && params.customCompatibility === 'anthropic') {
    return stripTrailingV1(params.baseUrl)
  }
  return normalizeBaseUrl(params.baseUrl)
}

function resolveCustomProviderApi(
  compatibility: CustomProviderCompatibility,
): CustomProviderApi {
  return compatibility === 'anthropic' ? 'anthropic-messages' : 'openai-completions'
}

function resolveProviderApi(params: {
  providerType: UpstreamProviderType
  customCompatibility?: CustomProviderCompatibility
}): CustomProviderApi {
  if (params.providerType === 'custom') {
    return resolveCustomProviderApi(
      normalizeCustomProviderCompatibility(params.customCompatibility),
    )
  }
  return 'openai-completions'
}

async function fetchProviderModels(params: {
  providerType: UpstreamProviderType
  baseUrl: string
  apiKey: string
  customCompatibility?: CustomProviderCompatibility
}): Promise<{ models: string[]; normalizedBaseUrl: string }> {
  const customCompatibility = normalizeCustomProviderCompatibility(params.customCompatibility)
  const normalizedBaseUrl = normalizeProviderBaseUrl({
    providerType: params.providerType,
    baseUrl: params.baseUrl,
    customCompatibility,
  })
  const isAnthropicCompatible =
    params.providerType === 'custom' && customCompatibility === 'anthropic'
  const url = isAnthropicCompatible
    ? `${normalizedBaseUrl}/v1/models`
    : `${normalizedBaseUrl}/models`
  const headers: Record<string, string> = isAnthropicCompatible
    ? {
        'x-api-key': params.apiKey,
        'anthropic-version': ANTHROPIC_VERSION_HEADER,
      }
    : {
        'Authorization': `Bearer ${params.apiKey}`,
      }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    const detail = trimDetail(await res.text().catch(() => ''), 240)
    throw new Error(detail ? `${res.status} ${detail}` : `${res.status} ${res.statusText}`)
  }

  const data = await res.json() as any
  const models = (data.data || data.models || [])
    .map((model: any) => typeof model === 'string' ? model : model.id)
    .filter((modelId: string | undefined): modelId is string => Boolean(modelId))

  return { models, normalizedBaseUrl }
}

function requiresAkPrefixedApiKey(
  providerType: UpstreamProviderType,
  baseUrl?: string | null,
): boolean {
  return providerType === 'commonstack' && COMMONSTACK_BASE_URLS.has(normalizeBaseUrl(baseUrl))
}

interface SystemNodeProbe {
  versionCmd: string
  pathCmd: string
  versionOutput?: string
  pathOutput?: string
  version: string | null
  path: string | null
  supported: boolean
  versionError?: string
  pathError?: string
}

function trimDetail(value: string | undefined, max = 600): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function formatProbeValue(value: string | undefined | null): string {
  const text = value?.trim()
  return text ? text : '<empty>'
}

function formatExists(path: string): string {
  return `${path} (${existsSync(path) ? 'exists' : 'missing'})`
}

function buildProviderModelsList(models: any[]) {
  return models.map((m: any) => {
    const id = typeof m === 'string' ? m : m.id
    return {
      id,
      name: (typeof m === 'object' && m.name) || id,
      reasoning: false,
      input: ['text'],
      contextWindow: 128000,
      maxTokens: 16384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    }
  })
}

function pickDefaultModelId(
  modelsList: Array<{ id: string }>,
  requestedDefaultModel?: string,
): string {
  const requested = requestedDefaultModel?.trim() || ''
  if (requested && modelsList.some((model) => model.id === requested)) {
    return requested
  }
  return modelsList.find((model) => model.id === 'openai/gpt-4o-mini')?.id || modelsList[0]?.id || requested
}

function ensureOpenclawConfigExists(): void {
  if (existsSync(OPENCLAW_CONFIG)) return

  const dir = dirname(OPENCLAW_CONFIG)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const minimalConfig = {
    gateway: {
      port: GATEWAY_PORT,
      mode: 'local',
      bind: 'loopback',
    },
  }
  writeFileSync(OPENCLAW_CONFIG, JSON.stringify(minimalConfig, null, 2), 'utf-8')
}

async function bootstrapGatewayAfterEnvSetup(mode: 'portable' | 'system'): Promise<void> {
  ensureOpenclawConfigExists()
  ensureGatewayMode()
  syncGatewayUrl()

  // Disconnect WebSocket before killing/restarting the gateway to avoid
  // the backend process being caught by port-based cleanup.
  openclawGetClient().disconnect()

  if (plat === 'win32') {
    await killPort(GATEWAY_PORT)
    await ensureGatewayWindows(mode)
  } else {
    await restartGateway(mode)
  }

  await waitForGatewayPort()
  syncGatewayUrl()
}

function applyProviderConfigToOpenClaw(params: {
  config: any
  providerId: string
  baseUrl: string
  apiKey: string
  providerApi: CustomProviderApi
  defaultModel: string
  modelsList: Array<{ id: string }>
  providerType: UpstreamProviderType
}) {
  const { config, providerId, baseUrl, apiKey, providerApi, defaultModel, modelsList, providerType } = params

  if (!config.models) config.models = {}
  if (!config.models.providers) config.models.providers = {}
  if (!config.models.mode) config.models.mode = 'merge'
  const existingProvider = config.models.providers[providerId] || {}
  config.models.providers[providerId] = {
    ...existingProvider,
    baseUrl,
    apiKey,
    api: providerApi,
    models: modelsList,
  }

  if (!config.agents) config.agents = {}
  if (!config.agents.defaults) config.agents.defaults = {}
  const existingDefaultModel =
    config.agents.defaults.model && typeof config.agents.defaults.model === 'object'
      ? config.agents.defaults.model
      : {}
  config.agents.defaults.model = {
    ...existingDefaultModel,
    primary: `${providerId}/${defaultModel}`,
  }

  if (!config.agents.defaults.models) config.agents.defaults.models = {}
  for (const model of modelsList) {
    const modelRef = `${providerId}/${model.id}`
    if (!config.agents.defaults.models[modelRef]) {
      config.agents.defaults.models[modelRef] = {}
    }
  }

  if (providerType === 'commonstack') {
    if (!config.tools) config.tools = {}
    if (!config.tools.web) config.tools.web = {}
    if (!config.tools.web.search) config.tools.web.search = {}
    config.tools.web.search.apiKey = apiKey
  }

  return `${providerId}/${defaultModel}`
}

function listPortableNodeBins(binName: string): string[] {
  const runtimeRoot = join(homedir(), '.wrapperbox', 'runtime', 'node')
  if (!existsSync(runtimeRoot)) return []

  return readdirSync(runtimeRoot)
    .filter((entry) => entry.startsWith('node-v'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
    .map((entry) => (
      plat === 'win32'
        ? join(runtimeRoot, entry, binName)
        : join(runtimeRoot, entry, 'bin', binName)
    ))
}

async function probeSystemNode(): Promise<SystemNodeProbe> {
  const shell = plat === 'win32' ? CMD_EXE : (plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash'))
  const versionCmd = plat === 'win32'
    ? 'node --version'
    : 'source ~/.nvm/nvm.sh 2>/dev/null; node --version'
  const pathCmd = plat === 'win32'
    ? 'where node'
    : 'source ~/.nvm/nvm.sh 2>/dev/null; which node'

  let versionOutput: string | undefined
  let pathOutput: string | undefined
  let versionError: string | undefined
  let pathError: string | undefined

  try {
    const { stdout } = await execAsync(versionCmd, {
      shell,
      timeout: 5000,
      env: { ...process.env, HOME: homedir() },
    })
    versionOutput = stdout.trim()
  } catch (e: any) {
    versionError = e.message
  }

  try {
    const { stdout } = await execAsync(pathCmd, {
      shell,
      timeout: 5000,
      env: { ...process.env, HOME: homedir() },
    })
    pathOutput = stdout.trim()
  } catch (e: any) {
    pathError = e.message
  }

  const version = versionOutput || null
  const path = pathOutput?.split(/\r?\n/)[0]?.trim() || null

  return {
    versionCmd,
    pathCmd,
    versionOutput,
    pathOutput,
    version,
    path,
    supported: !!version && /^v24\./.test(version),
    versionError,
    pathError,
  }
}

async function probeGatewayConnection(gatewayUrl?: string): Promise<{ connected: boolean; error?: string }> {
  if (!gatewayUrl) return { connected: false, error: 'Gateway URL not configured' }
  try {
    await openclawRpc(gatewayUrl, 'config.get', {}, 5000)
    return { connected: true }
  } catch (e: any) {
    return { connected: false, error: e.message }
  }
}

async function buildNodeDebugLines(mode?: 'portable' | 'system', systemProbe?: SystemNodeProbe | null): Promise<string[]> {
  const lines: string[] = [
    `mode: ${mode || 'auto'}`,
    `target version: v${TARGET_NODE_VERSION}`,
  ]

  const runtimeRoot = join(homedir(), '.wrapperbox', 'runtime', 'node')
  const expectedPortableDir = join(runtimeRoot, `node-v${TARGET_NODE_VERSION}-${getNodePlatformArch()}`)
  const expectedPortableNode = plat === 'win32'
    ? join(expectedPortableDir, 'node.exe')
    : join(expectedPortableDir, 'bin', 'node')

  if (mode !== 'portable') {
    const probe = systemProbe || await probeSystemNode()
    lines.push(`system version command: ${probe.versionCmd}`)
    if (probe.versionOutput) {
      lines.push(`system version output: ${formatProbeValue(probe.versionOutput)}`)
    } else if (probe.versionError) {
      lines.push(`system version error: ${probe.versionError}`)
    } else {
      lines.push('system version output: <empty>')
    }

    lines.push(`system path command: ${probe.pathCmd}`)
    if (probe.path) {
      lines.push(`system node path: ${probe.path}`)
    } else if (probe.pathError) {
      lines.push(`system path error: ${probe.pathError}`)
    } else {
      lines.push('system node path: <empty>')
    }
  }

  lines.push(`portable runtime root: ${runtimeRoot}`)
  lines.push(`expected portable dir: ${formatExists(expectedPortableDir)}`)
  lines.push(`expected portable node: ${formatExists(expectedPortableNode)}`)

  const portableCandidates = listPortableNodeBins(plat === 'win32' ? 'node.exe' : 'node')
  if (portableCandidates.length === 0) {
    lines.push('portable node candidates: <none>')
  } else {
    for (const candidate of portableCandidates) {
      lines.push(`portable node candidate: ${formatExists(candidate)}`)
    }
  }

  return lines
}

async function buildOpenclawDebugLines(resolveMode: OpenclawResolveMode): Promise<string[]> {
  const lines: string[] = [
    `resolve mode: ${resolveMode}`,
    `target version: ${TARGET_OPENCLAW_VERSION}`,
  ]

  const runtimeRoot = join(homedir(), '.wrapperbox', 'runtime', 'node')
  const portableCandidates = listPortableNodeBins(plat === 'win32' ? 'openclaw.cmd' : 'openclaw')
  lines.push(`portable runtime root: ${runtimeRoot}`)
  if (portableCandidates.length === 0) {
    lines.push('portable openclaw candidates: <none>')
  } else {
    for (const candidate of portableCandidates) {
      lines.push(`portable openclaw candidate: ${formatExists(candidate)}`)
    }
  }

  if (plat === 'win32') {
    lines.push('system candidate search: where openclaw.cmd / where openclaw')
  } else {
    const shell = plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash')
    const pathCmd = 'command -v openclaw'
    lines.push(`system path command: ${pathCmd}`)
    try {
      const { stdout } = await execAsync(pathCmd, {
        shell: '/bin/sh',
        timeout: 3000,
        env: { ...process.env, HOME: homedir() },
      })
      lines.push(`system openclaw path: ${formatProbeValue(stdout.trim().split(/\r?\n/)[0])}`)
    } catch (e: any) {
      lines.push(`system path error: ${e.message}`)
    }

    const nvmCmd = 'source ~/.nvm/nvm.sh 2>/dev/null; which openclaw'
    lines.push(`nvm path command: ${nvmCmd}`)
    try {
      const { stdout } = await execAsync(nvmCmd, {
        shell,
        timeout: 5000,
        env: { ...process.env, HOME: homedir() },
      })
      lines.push(`nvm openclaw path: ${formatProbeValue(stdout.trim().split(/\r?\n/)[0])}`)
    } catch (e: any) {
      lines.push(`nvm path error: ${e.message}`)
    }

    for (const candidate of listSystemOpenclawCandidatePaths()) {
      lines.push(`system candidate: ${formatExists(candidate)}`)
    }
  }

  const resolvedBin = await findOpenclawBin(resolveMode)
  const resolvedDisplay = resolvedBin === 'openclaw' || resolvedBin === 'openclaw.cmd'
    ? `${resolvedBin} (lookup via PATH)`
    : formatExists(resolvedBin)
  lines.push(`resolved binary: ${resolvedDisplay}`)

  try {
    const { stdout, stderr } = await runOpenclawCmd('--version', 10000, resolveMode)
    lines.push(`version output: ${trimDetail(`${stdout}\n${stderr}`) || '<empty>'}`)
  } catch (e: any) {
    lines.push(`version error: ${e.message}`)
  }

  return lines
}

async function buildGatewayDebugLines(gatewayProbe?: { connected: boolean; error?: string }): Promise<string[]> {
  const config = getConfig()
  const listening = await isPortListening(GATEWAY_PORT)

  const lines = [
    `port: ${GATEWAY_PORT}`,
    `port listening: ${listening ? 'yes' : 'no'}`,
    `configured gateway URL: ${config.providers?.openclaw?.baseUrl || '<empty>'}`,
  ]

  if (gatewayProbe) {
    lines.push(`backend rpc connected: ${gatewayProbe.connected ? 'yes' : 'no'}`)
    if (gatewayProbe.error) lines.push(`backend rpc error: ${gatewayProbe.error}`)
  }

  return lines
}

async function formatPortableRuntimeFailure(
  runtime: NodeRuntime | null,
  lang: string,
  reason?: string,
): Promise<string> {
  const bin = await findOpenclawBin('portable')
  const binExists = existsSync(bin)
  const portableLaunch = resolvePortableOpenclawLaunch(bin)
  const runtimeDir = runtime ? getPortableRuntimeDir(runtime) : null
  const manifest = runtimeDir ? readPortableRuntimeManifest(runtimeDir) : null
  const manifestPath = runtimeDir ? getPortableRuntimeManifestPath(runtimeDir) : null

  const versionProbe = await runOpenclawCmd('--version', 10000, 'portable')
    .then(({ stdout, stderr }) => trimDetail(`${stdout}\n${stderr}`) || '<empty>')
    .catch((e: any) => `<error: ${e.message}>`)

  const labels = lang === 'zh'
    ? {
        title: 'portable runtime 验证失败',
        reason: '原因',
        runtimeDir: 'runtime 目录',
        node: 'node',
        npm: 'npm',
        manifest: 'runtime manifest',
        bin: '解析到的 portable openclaw',
        entry: 'portable openclaw 入口',
        version: 'portable openclaw --version',
        exists: '存在',
        missing: '不存在',
      }
    : {
        title: 'Portable runtime verification failed',
        reason: 'Reason',
        runtimeDir: 'Runtime dir',
        node: 'node',
        npm: 'npm',
        manifest: 'Runtime manifest',
        bin: 'Resolved portable openclaw',
        entry: 'Portable openclaw entry',
        version: 'portable openclaw --version',
        exists: 'exists',
        missing: 'missing',
      }

  const lines = [
    labels.title,
    ...(reason ? [`${labels.reason}: ${reason}`] : []),
    `${labels.runtimeDir}: ${runtimeDir || '<empty>'}`,
    `${labels.node}: ${runtime?.nodeBin || '<empty>'}`,
    `${labels.npm}: ${runtime?.npmBin || '<empty>'}`,
    `${labels.manifest}: ${manifestPath || '<empty>'} => ${manifest ? JSON.stringify(manifest) : '<missing>'}`,
    `${labels.bin}: ${bin} (${binExists ? labels.exists : labels.missing})`,
    `${labels.entry}: ${portableLaunch ? `${portableLaunch.entryPath} (${labels.exists})` : `<missing>`}`,
    `${labels.version}: ${versionProbe}`,
  ]

  return lines.join('\n')
}

async function ensurePortableRuntimeOpenclaw(
  runtime: NodeRuntime | null,
  lang: string,
  reason?: string,
): Promise<{ ok: true; runtime: NodeRuntime; version: string } | { ok: false; error: string }> {
  let preparedRuntime = runtime
  try {
    preparedRuntime = await extractPortableNode(lang, { force: true })
  } catch (e: any) {
    return {
      ok: false,
      error: await formatPortableRuntimeFailure(preparedRuntime, lang, e.message),
    }
  }

  const check = await checkOpenclawInstalled('portable')
  if (!check.installed) {
    return {
      ok: false,
      error: await formatPortableRuntimeFailure(preparedRuntime, lang, reason),
    }
  }

  if (check.version && compareVersions(check.version, TARGET_OPENCLAW_VERSION) < 0) {
    const mismatchMessage = lang === 'zh'
      ? `内置 openclaw 版本仍为 ${check.version}，低于目标版本 ${TARGET_OPENCLAW_VERSION}`
      : `Bundled openclaw version is still ${check.version}, below target ${TARGET_OPENCLAW_VERSION}`
    return {
      ok: false,
      error: await formatPortableRuntimeFailure(preparedRuntime, lang, mismatchMessage),
    }
  }

  return { ok: true, runtime: preparedRuntime, version: check.version || TARGET_OPENCLAW_VERSION }
}

// GET /env-status — quick check of all environment dependencies
onboardRoutes.get('/env-status', async (c) => {
  try {
    if (plat === 'win32') {
      await refreshWindowsPath()
    }

    const config = getConfig()
    const mode = config.envMode || undefined
    const resolveMode: OpenclawResolveMode = mode === 'portable'
      ? 'portable'
      : mode === 'system'
        ? 'system'
        : 'auto'

    const [autoNodeRuntime, portableNodeRuntime, systemNodeProbe, openclaw, gatewayProbe] = await Promise.all([
      !mode ? detectNodeRuntime() : Promise.resolve(null),
      mode === 'portable' ? Promise.resolve(detectPortableNode()) : Promise.resolve(null),
      mode === 'system' ? probeSystemNode() : Promise.resolve(null),
      checkOpenclawInstalled(resolveMode),
      mode === 'system'
        ? probeGatewayConnection(config.providers?.openclaw?.baseUrl)
        : Promise.resolve({ connected: openclawGetClient().isConnected() }),
    ])

    let nodeVersion: string | null = null
    let nodeSource: 'system' | 'portable' | null = null
    let nodeSupported = false

    if (mode === 'portable') {
      nodeVersion = portableNodeRuntime?.version || null
      nodeSource = portableNodeRuntime?.source || null
      nodeSupported = !!portableNodeRuntime
    } else if (mode === 'system') {
      nodeVersion = systemNodeProbe?.version || null
      nodeSource = systemNodeProbe?.version ? 'system' : null
      nodeSupported = systemNodeProbe?.supported === true
    } else {
      nodeVersion = autoNodeRuntime?.version || null
      nodeSource = autoNodeRuntime?.source || null
      nodeSupported = !!autoNodeRuntime
    }

    const openclawVersionOk = openclaw.installed && openclaw.version
      ? compareVersions(openclaw.version, TARGET_OPENCLAW_VERSION) >= 0
      : false

    // On Windows, also verify openclaw can actually run (not just a stale shim)
    let openclawFunctional = openclawVersionOk
    if (openclawVersionOk && plat === 'win32') {
      try {
        await runOpenclawCmd('--version', 5000, resolveMode)
      } catch (e: any) {
        log.warn(`env-status: resolved openclaw binary cannot execute (${e.message})`)
        openclawFunctional = false
      }
    }

    // Keep response format compatible with frontend expectations
    const hasDetectedNode = !!nodeVersion
    const nvm = { installed: hasDetectedNode, version: nodeVersion || undefined }
    const node = { installed: hasDetectedNode, version: nodeVersion || undefined, supported: nodeSupported }
    const registry = {
      configured: true,
      current: 'via --registry (zh=npmmirror, en=npmjs)',
    }

    const allReady = mode === 'system'
      ? openclawFunctional && gatewayProbe.connected
      : nodeSupported && openclawFunctional
    const status = !allReady
      ? 'not_ready'
      : mode === 'system' && !nodeSupported
        ? 'warning'
        : 'ready'

    const payload: any = {
      allReady,
      status,
      mode,
      gatewayConnected: gatewayProbe.connected,
      nodeVersion,
      nodeTargetVersion: `v${TARGET_NODE_VERSION}`,
      nodeSource,
      nodeSupported,
      openclawVersion: openclaw.version || null,
      nvm, node, registry, openclaw,
    }

    if (status !== 'ready') {
      const [gatewayLines, nodeLines, openclawLines] = await Promise.all([
        buildGatewayDebugLines(gatewayProbe),
        buildNodeDebugLines(mode, systemNodeProbe),
        buildOpenclawDebugLines(resolveMode),
      ])
      payload.debug = { gatewayLines, nodeLines, openclawLines }
    }

    return c.json(payload)
  } catch (e: any) {
    log.error(`env-status error: ${e.message}`)
    return c.json({ allReady: false, error: e.message }, 500)
  }
})

// POST /env-setup — SSE stream: detect + install node, openclaw
onboardRoutes.post('/env-setup', async (c) => {
  const body = await c.req.json<{ lang?: string; mode?: 'portable' | 'system' }>().catch(() => ({}))
  const lang = (body as any)?.lang || 'zh'
  const mode = (body as any)?.mode || 'portable'

  // Persist the chosen mode
  patchConfig({ envMode: mode } as any)

  return streamSSE(c, async (stream) => {
    const send = async (step: string, status: 'running' | 'done' | 'error' | 'version_warning', message?: string, data?: any) => {
      await stream.writeSSE({
        data: JSON.stringify({ step, status, message, ...(data ? { data } : {}) }),
        event: 'progress',
        id: Date.now().toString(),
      })
    }

    const sendLog = async (logMessage: string) => {
      await stream.writeSSE({
        data: JSON.stringify({ log: logMessage }),
        event: 'progress',
        id: Date.now().toString(),
      })
    }

    try {
      if (mode === 'portable') {
        // ── Portable path: check_node → check_openclaw ──
        let runtime: NodeRuntime | null = null

        await send('check_node', 'running', lang === 'zh' ? '准备 Node.js 运行时...' : 'Preparing Node.js runtime...')
        try {
          runtime = await extractPortableNode(lang, { onLog: sendLog })
          await send('check_node', 'done', `Node.js ${runtime.version} (portable)`)
        } catch (e: any) {
          await send('check_node', 'error', e.message)
          return
        }

        await send('check_openclaw', 'running', lang === 'zh' ? '检查 openclaw...' : 'Checking openclaw...')
        const ocStatus = await checkOpenclawInstalled('portable')
        log.info(`check_openclaw: installed=${ocStatus.installed}, version=${ocStatus.version}`)

        const needsInstall = !ocStatus.installed
        const needsUpdate = ocStatus.installed && ocStatus.version
          ? compareVersions(ocStatus.version, TARGET_OPENCLAW_VERSION) < 0
          : false

        if (needsInstall || needsUpdate) {
          const msg = lang === 'zh'
            ? `正在同步内置 openclaw@${TARGET_OPENCLAW_VERSION}...`
            : `Syncing bundled openclaw@${TARGET_OPENCLAW_VERSION}...`
          await send('check_openclaw', 'running', msg)

          const syncResult = await ensurePortableRuntimeOpenclaw(
            runtime,
            lang,
            lang === 'zh'
              ? '重解压内置 portable runtime 后仍未检测到 openclaw'
              : 'openclaw is still missing after re-extracting the bundled portable runtime',
          )
          if (!syncResult.ok) {
            await send('check_openclaw', 'error', syncResult.error)
            return
          }
          runtime = syncResult.runtime
        }

        await send(
          'check_openclaw',
          'running',
          lang === 'zh' ? '正在初始化 OpenClaw 网关...' : 'Initializing OpenClaw gateway...',
        )
        await bootstrapGatewayAfterEnvSetup('portable')
        const installedVersion = needsInstall || needsUpdate
          ? TARGET_OPENCLAW_VERSION
          : (ocStatus.version || '')
        await send('check_openclaw', 'done', `openclaw ${installedVersion}`)

        // Save onboard state for portable mode
        const finalRuntime = runtime!
        writeOnboardState({
          completed: true,
          mode: 'portable',
          timestamp: new Date().toISOString(),
          nodeVersion: finalRuntime.version,
          openclawVersion: installedVersion || undefined,
        })

        await send('complete', 'done')

      } else {
        // ── System path: only check_openclaw (read-only, no installs) ──
        await send('check_openclaw', 'running', lang === 'zh' ? '检测系统 openclaw...' : 'Detecting system openclaw...')
        const ocStatus = await checkOpenclawInstalled('system')
        log.info(`system check_openclaw: installed=${ocStatus.installed}, version=${ocStatus.version}`)

        if (!ocStatus.installed) {
          await send('check_openclaw', 'error',
            lang === 'zh'
              ? '未检测到 openclaw。请先手动安装：npm install -g openclaw'
              : 'openclaw not found. Please install manually: npm install -g openclaw')
          return
        }

        const cmp = compareVersions(ocStatus.version!, TARGET_OPENCLAW_VERSION)
        if (cmp < 0) {
          // Version lower than target — warning but allow continue
          await send('check_openclaw', 'version_warning',
            lang === 'zh'
              ? `已安装版本 ${ocStatus.version} 低于推荐版本 ${TARGET_OPENCLAW_VERSION}`
              : `Installed version ${ocStatus.version} is older than recommended ${TARGET_OPENCLAW_VERSION}`,
            { installed: ocStatus.version, target: TARGET_OPENCLAW_VERSION })
          return
        }

        await send(
          'check_openclaw',
          'running',
          lang === 'zh' ? '正在初始化 OpenClaw 网关...' : 'Initializing OpenClaw gateway...',
        )
        await bootstrapGatewayAfterEnvSetup('system')
        await send('check_openclaw', 'done', `openclaw ${ocStatus.version}`)

        // Save onboard state for system mode
        const nodeRuntime = await detectNodeRuntime()
        writeOnboardState({
          completed: true,
          mode: 'system',
          timestamp: new Date().toISOString(),
          nodeVersion: nodeRuntime?.version,
          openclawVersion: ocStatus.version || undefined,
        })

        await send('complete', 'done')
      }
    } catch (e: any) {
      log.error(`env-setup error: ${e.message}`)
      await stream.writeSSE({
        data: JSON.stringify({ step: 'error', status: 'error', message: e.message }),
        event: 'progress',
        id: Date.now().toString(),
      })
    }
  })
})

// GET /status — check whether environment onboarding is complete
onboardRoutes.get('/status', (c) => {
  try {
    const needed = checkOnboardNeeded()
    if (needed) {
      return c.json({ needed: true })
    }

    // Keep requiring a local config file so the gateway can be started
    // without sending users back through the wizard.
    if (!existsSync(OPENCLAW_CONFIG)) {
      return c.json({ needed: true })
    }

    return c.json({ needed: false })
  } catch (e: any) {
    log.error(`onboard/status error: ${e.message}`)
    return c.json({ needed: true })
  }
})

// POST /models — fetch available models from provider
onboardRoutes.post('/models', async (c) => {
  const { baseUrl, apiKey, customCompatibility } = await c.req.json<{
    baseUrl: string
    apiKey: string
    customCompatibility?: CustomProviderCompatibility
  }>()
  if (!baseUrl || !apiKey) return c.json({ error: 'baseUrl and apiKey are required' }, 400)

  try {
    const { models } = await fetchProviderModels({
      providerType: customCompatibility ? 'custom' : 'commonstack',
      baseUrl,
      apiKey,
      customCompatibility,
    })
    return c.json({ models })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /run — SSE stream: execute configuration steps
onboardRoutes.post('/run', async (c) => {
  const body = await c.req.json<{
    providerType: UpstreamProviderType
    baseUrl: string
    apiKey: string
    customCompatibility?: CustomProviderCompatibility
    defaultModel?: string
    lang: string
  }>()

  const { providerType, baseUrl, apiKey, customCompatibility, defaultModel, lang } = body
  const resolvedCustomCompatibility = normalizeCustomProviderCompatibility(customCompatibility)
  const normalizedBaseUrl = normalizeProviderBaseUrl({
    providerType,
    baseUrl,
    customCompatibility: resolvedCustomCompatibility,
  })
  const providerApi = resolveProviderApi({
    providerType,
    customCompatibility: resolvedCustomCompatibility,
  })
  const providerId = providerType === 'commonstack' ? 'commonstack' : DEFAULT_CUSTOM_PROVIDER_ID

  return streamSSE(c, async (stream) => {
    const send = async (step: string, status: 'running' | 'done' | 'error', message?: string, data?: any) => {
      await stream.writeSSE({
        data: JSON.stringify({ step, status, message, data }),
        event: 'progress',
        id: Date.now().toString(),
      })
    }

    try {
      // ── Step 1: validate ──
      await send('validate', 'running', 'Validating API key format...')
      if (!apiKey) {
        await send('validate', 'error', 'API key is required')
        return
      }
      if (requiresAkPrefixedApiKey(providerType, baseUrl) && !apiKey.startsWith('ak-')) {
        await send('validate', 'error', 'API key must start with "ak-"')
        return
      }
      try {
        new URL(normalizedBaseUrl || baseUrl)
      } catch {
        await send('validate', 'error', 'Base URL must be a valid URL')
        return
      }
      await send('validate', 'done', 'API key format valid')

      // ── Step 2: init_openclaw ──
      await send('init_openclaw', 'running', 'Checking OpenClaw installation...')
      if (!existsSync(OPENCLAW_CONFIG)) {
        try {
          const dir = dirname(OPENCLAW_CONFIG)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          const minimalConfig = {
            gateway: {
              port: GATEWAY_PORT,
              mode: 'local',
              bind: 'loopback',
            },
          }
          writeFileSync(OPENCLAW_CONFIG, JSON.stringify(minimalConfig, null, 2), 'utf-8')
          await send('init_openclaw', 'done', 'Created openclaw config')
        } catch (e: any) {
          await send('init_openclaw', 'error', `Failed to create openclaw config: ${e.message}`)
          return
        }
      } else {
        await send('init_openclaw', 'done', 'OpenClaw config exists')
      }

      // ── Step 3: fetch_models ──
      await send('fetch_models', 'running', 'Verifying API key and fetching models...')
      let models: string[] = []
      let providerBaseUrl = normalizedBaseUrl
      let resolvedDefaultModel = ''
      try {
        const result = await fetchProviderModels({
          providerType,
          baseUrl: normalizedBaseUrl,
          apiKey,
          customCompatibility: resolvedCustomCompatibility,
        })
        models = result.models
        providerBaseUrl = result.normalizedBaseUrl
        const modelsList = buildProviderModelsList(models)
        if (modelsList.length === 0) {
          throw new Error('No models returned')
        }
        resolvedDefaultModel = pickDefaultModelId(modelsList, defaultModel)
        await send('fetch_models', 'done', `Fetched ${models.length} models`, {
          count: models.length,
          defaultModel: resolvedDefaultModel,
        })
      } catch (e: any) {
        await send('fetch_models', 'error', `Failed to fetch models: ${e.message}`)
        return
      }

      // ── Step 4: backup ──
      await send('backup', 'running', 'Backing up existing configuration...')
      try {
        const backupPath = OPENCLAW_CONFIG + '.provider-backup'
        copyFileSync(OPENCLAW_CONFIG, backupPath)
        await send('backup', 'done', 'Backup created')
      } catch (e: any) {
        await send('backup', 'error', `Backup failed: ${e.message}`)
        return
      }

      // ── Step 5: apply_provider ──
      await send('apply_provider', 'running', 'Writing model provider configuration...')
      try {
        const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
        const config = JSON.parse(raw)
        const modelsList = buildProviderModelsList(models)
        const defaultModelRef = applyProviderConfigToOpenClaw({
          config,
          providerId,
          baseUrl: providerBaseUrl,
          apiKey,
          providerApi,
          defaultModel: resolvedDefaultModel,
          modelsList,
          providerType,
        })

        writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8')
        syncGatewayUrl()
        await send('apply_provider', 'done', 'Provider configuration written')
      } catch (e: any) {
        await send('apply_provider', 'error', `Failed to apply provider: ${e.message}`)
        return
      }

      // ── Step 6: title_model ──
      await send('title_model', 'running', 'Aligning titles and tool summaries with the default model...')
      try {
        await send('title_model', 'done', 'Titles and tool summaries will follow the current default model')
      } catch (e: any) {
        await send('title_model', 'error', `Failed to configure title model: ${e.message}`)
        return
      }

      // ── Step 7: restart_gateway ──
      const gatewayWasRunning = await isPortListening(GATEWAY_PORT)
      await send('restart_gateway', 'running', lang === 'zh' ? '正在重启网关...' : 'Restarting gateway...')

      // CRITICAL: disconnect WebSocket to gateway BEFORE killing the port.
      // Otherwise killPort's `lsof -ti:PORT | xargs kill -9` also kills the
      // backend process itself (because it has a client socket to port 18789).
      openclawGetClient().disconnect()

      try {
        if (plat === 'win32') {
          await killPort(GATEWAY_PORT)
          await ensureGatewayWindows(getConfig().envMode === 'portable' ? 'portable' : 'system')
        } else {
          await restartGateway()
        }
      } catch (e: any) {
        log.warn(`Gateway restart warning: ${e.message}`)
      }

      // Always wait the full duration — even on reconfigure, the new gateway process
      // needs time to start (Windows Defender scan, Node.js startup, config load).
      await send('restart_gateway', 'running', lang === 'zh' ? '等待网关就绪...' : 'Waiting for gateway...')
      await waitForGatewayPort()
      syncGatewayUrl()
      await send('restart_gateway', 'done', lang === 'zh' ? '网关已重启' : 'Gateway restarted')

      // ── Step 8: test_connection ──
      await send('test_connection', 'running', lang === 'zh' ? '正在测试连接...' : 'Testing connection...')

      // Ensure gateway port is up before attempting WebSocket RPC
      if (!await isPortListening(GATEWAY_PORT)) {
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 1000))
          if (await isPortListening(GATEWAY_PORT)) break
        }
        syncGatewayUrl()
      }

      let connectionOk = false
      let lastTestError = ''
      const MAX_TEST_ATTEMPTS = 40
      const RPC_TIMEOUT = 8000

      for (let attempt = 1; attempt <= MAX_TEST_ATTEMPTS; attempt++) {
        syncGatewayUrl()
        const gatewayUrl = getConfig().providers.openclaw.baseUrl
        log.info(`Connection test ${attempt}/${MAX_TEST_ATTEMPTS}`)

        openclawGetClient().disconnect()

        try {
          await openclawRpc(gatewayUrl, 'models.list', {}, RPC_TIMEOUT)
          connectionOk = true
          log.info('Connection test succeeded')
          break
        } catch (e: any) {
          lastTestError = e.message
          log.warn(`Connection test ${attempt} failed: ${e.message}`)
          if (attempt < MAX_TEST_ATTEMPTS) {
            await new Promise(r => setTimeout(r, 2000))
          }
        }
      }

      if (!connectionOk) {
        await send('test_connection', 'error',
          lang === 'zh'
            ? `连接失败: ${lastTestError} — 请手动运行 "openclaw gateway restart" 后重试`
            : `Connection failed: ${lastTestError}`)
        return
      }
      await send('test_connection', 'done', lang === 'zh' ? '连接成功' : 'Connected')

      // ── Complete ──
      // Update onboard state timestamp (provider configuration completed)
      const currentState = readOnboardState()
      if (currentState) {
        writeOnboardState({
          ...currentState,
          timestamp: new Date().toISOString(),
        })
      }

      await send('complete', 'done')

    } catch (e: any) {
      log.error(`Onboard run error: ${e.message}`)
      await stream.writeSSE({
        data: JSON.stringify({ step: 'error', status: 'error', message: e.message }),
        event: 'progress',
        id: Date.now().toString(),
      })
    }
  })
})

// POST /env-setup/resolve-openclaw-version — user resolves version mismatch
onboardRoutes.post('/env-setup/resolve-openclaw-version', async (c) => {
  const body = await c.req.json<{ action: 'continue' | 'reinstall'; lang?: string }>().catch(() => ({ action: 'continue' as const, lang: undefined }))
  const { action, lang: rawLang } = body
  const lang = rawLang || 'zh'

  if (action === 'continue') {
    try {
      const ocStatus = await checkOpenclawInstalled('system')
      if (!ocStatus.installed || !ocStatus.version) {
        return c.json({
          success: false,
          error: lang === 'zh' ? '未检测到系统 openclaw' : 'System openclaw was not detected',
        }, 400)
      }

      await bootstrapGatewayAfterEnvSetup('system')
      const nodeRuntime = await detectNodeRuntime()
      writeOnboardState({
        completed: true,
        mode: 'system',
        timestamp: new Date().toISOString(),
        nodeVersion: nodeRuntime?.version,
        openclawVersion: ocStatus.version,
      })

      return c.json({ success: true, message: lang === 'zh' ? '继续使用当前版本' : 'Continuing with current version' })
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500)
    }
  }

  if (action === 'reinstall') {
    // Only allow reinstall in portable mode
    const config = getConfig()
    if (config.envMode === 'system') {
      return c.json({ success: false, error: lang === 'zh' ? '系统模式下不支持重新安装，请手动更新 openclaw' : 'Reinstall not available in system mode. Please update openclaw manually.' }, 400)
    }
    // Disconnect WebSocket before killing port to avoid killing the backend itself
    openclawGetClient().disconnect()
    await killPort(GATEWAY_PORT)
    await new Promise(r => setTimeout(r, 1000))

    // Portable mode: use portable Node.js only, never system runtime
    let runtime = detectPortableNode()
    if (!runtime) {
      try {
        runtime = await extractPortableNode(lang)
      } catch (e: any) {
        return c.json({ success: false, error: lang === 'zh' ? `Node.js 准备失败: ${e.message}` : `Node.js setup failed: ${e.message}` }, 500)
      }
    }

    try {
      runtime = await extractPortableNode(lang, { force: true })
    } catch (e: any) {
      return c.json({
        success: false,
        error: await formatPortableRuntimeFailure(runtime, lang, e.message),
      }, 500)
    }
    const check = await checkOpenclawInstalled('portable')
    log.info(`Post-reinstall check: installed=${check.installed}, version=${check.version}`)
    if (!check.installed) {
      const detail = await formatPortableRuntimeFailure(runtime, lang,
        lang === 'zh'
          ? '重解压内置 portable runtime 后仍未检测到 openclaw'
          : 'openclaw is still missing after re-extracting the bundled portable runtime')
      return c.json({ success: false, error: detail }, 500)
    }
    if (compareVersions(check.version!, TARGET_OPENCLAW_VERSION) < 0) {
      return c.json({
        success: false,
        error: lang === 'zh'
          ? `内置 openclaw 版本为 ${check.version}，低于目标版本 ${TARGET_OPENCLAW_VERSION}`
          : `Bundled openclaw version ${check.version} is below target ${TARGET_OPENCLAW_VERSION}`,
      }, 500)
    }
    try {
      await killPort(GATEWAY_PORT)

      if (plat === 'win32') {
        await ensureGatewayWindows('portable')
      } else {
        await restartGateway('portable')
      }

      await waitForGatewayPort()
      syncGatewayUrl()

      for (let attempt = 1; attempt <= 6; attempt++) {
        syncGatewayUrl()
        const gatewayUrl = getConfig().providers.openclaw.baseUrl
        openclawGetClient().disconnect()
        try {
          await openclawRpc(gatewayUrl, 'models.list')
          log.info(`Gateway ready after reinstall (attempt ${attempt})`)
          break
        } catch (e: any) {
          log.warn(`Gateway poll ${attempt}/6 after reinstall: ${e.message}`)
          if (attempt < 6) await new Promise(r => setTimeout(r, 3000))
        }
      }
    } catch (e: any) {
      log.warn(`Gateway restart after reinstall failed: ${e.message}`)
    }
    return c.json({ success: true, version: check.version })
  }

  return c.json({ success: false, error: 'Invalid action' }, 400)
})

// GET /openclaw-version-check — startup version check
onboardRoutes.get('/openclaw-version-check', async (c) => {
  try {
    const qMode = c.req.query('mode')
    const cfgMode = getConfig().envMode
    const effectiveMode: OpenclawResolveMode =
      qMode === 'portable' || qMode === 'system' || qMode === 'auto'
        ? qMode
        : cfgMode === 'portable' || cfgMode === 'system'
          ? cfgMode
          : 'auto'
    const ocStatus = await checkOpenclawInstalled(effectiveMode)
    if (!ocStatus.installed) {
      return c.json({ status: 'not_installed', target: TARGET_OPENCLAW_VERSION })
    }
    const cmp = compareVersions(ocStatus.version!, TARGET_OPENCLAW_VERSION)
    if (cmp < 0) {
      return c.json({ status: 'outdated', installed: ocStatus.version, target: TARGET_OPENCLAW_VERSION })
    }
    if (cmp === 0) {
      return c.json({ status: 'ok', installed: ocStatus.version, target: TARGET_OPENCLAW_VERSION })
    }
    // cmp > 0
    return c.json({ status: 'newer', installed: ocStatus.version, target: TARGET_OPENCLAW_VERSION })
  } catch (e: any) {
    log.error(`openclaw-version-check error: ${e.message}`)
    return c.json({ status: 'not_installed', target: TARGET_OPENCLAW_VERSION, error: e.message })
  }
})
