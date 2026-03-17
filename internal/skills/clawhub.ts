import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createLogger } from '../logger'
import {
  detectNodeRuntime,
  npmInstallGlobal,
  type NodeRuntime,
} from '../onboard/node-runtime'
import { plat } from '../onboard/platform'
import { getWindowsNvmEnv } from '../onboard/windows-env'

const log = createLogger('ClawHub')
const CLAWHUB_API_BASE = 'https://clawhub.com/api/v1'
const CLAWHUB_COMMAND = plat === 'win32' ? 'clawhub.cmd' : 'clawhub'
const SEARCH_CACHE_TTL_MS = 5 * 60_000

const clawhubSearchCache = new Map<string, {
  expiresAt: number
  results: ClawhubSearchItem[]
}>()

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

interface ClawhubGlobalConfig {
  registry?: string
  token?: string
}

export interface ClawhubSearchItem {
  score: number
  slug: string
  displayName: string
  summary: string
  version: string | null
  updatedAt: number | null
}

export class ClawhubSearchError extends Error {
  status: number
  code: 'rate_limit' | 'upstream'
  retryAfterSeconds?: number

  constructor(
    message: string,
    options: {
      status: number
      code: 'rate_limit' | 'upstream'
      retryAfterSeconds?: number
    },
  ) {
    super(message)
    this.name = 'ClawhubSearchError'
    this.status = options.status
    this.code = options.code
    this.retryAfterSeconds = options.retryAfterSeconds
  }
}

export class ClawhubAuthActionError extends Error {
  code: 'invalid_token' | 'upstream'

  constructor(message: string, code: 'invalid_token' | 'upstream') {
    super(message)
    this.name = 'ClawhubAuthActionError'
    this.code = code
  }
}

export class ClawhubInstallError extends Error {
  code: 'requires_force' | 'upstream'

  constructor(message: string, code: 'requires_force' | 'upstream') {
    super(message)
    this.name = 'ClawhubInstallError'
    this.code = code
  }
}

function trimText(value: string | undefined | null, max = 240): string {
  const text = value?.trim() || ''
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

function normalizeLang(lang?: string): 'zh' | 'en' {
  return lang?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function buildSearchCacheKey(query: string, limit: number): string {
  return `${query}\n${limit}`
}

function getCachedSearch(key: string): ClawhubSearchItem[] | null {
  const entry = clawhubSearchCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    clawhubSearchCache.delete(key)
    return null
  }
  return entry.results
}

function setCachedSearch(key: string, results: ClawhubSearchItem[]): void {
  clawhubSearchCache.set(key, {
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    results,
  })
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined

  const asNumber = Number(value)
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber)
  }

  const asDate = Date.parse(value)
  if (!Number.isFinite(asDate)) {
    return undefined
  }

  const diffSeconds = Math.ceil((asDate - Date.now()) / 1000)
  return diffSeconds > 0 ? diffSeconds : undefined
}

function resolveClawhubConfigPath(baseDir: string): string {
  const clawhubPath = join(baseDir, 'clawhub', 'config.json')
  const legacyPath = join(baseDir, 'clawdhub', 'config.json')
  if (existsSync(clawhubPath)) return clawhubPath
  if (existsSync(legacyPath)) return legacyPath
  return clawhubPath
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function getClawhubConfigPath(): string {
  const override = process.env.CLAWHUB_CONFIG_PATH?.trim()
    || process.env.CLAWDHUB_CONFIG_PATH?.trim()
  if (override) {
    return resolve(override)
  }

  const home = homedir()
  if (plat === 'darwin') {
    return resolveClawhubConfigPath(join(home, 'Library', 'Application Support'))
  }

  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  if (xdg) {
    return resolveClawhubConfigPath(xdg)
  }

  if (plat === 'win32') {
    return resolveClawhubConfigPath(process.env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'))
  }

  return resolveClawhubConfigPath(join(home, '.config'))
}

async function readClawhubGlobalConfig(): Promise<ClawhubGlobalConfig | null> {
  try {
    const raw = await readFile(getClawhubConfigPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      registry: typeof parsed.registry === 'string' ? parsed.registry.trim() : undefined,
      token: typeof parsed.token === 'string' ? parsed.token.trim() : undefined,
    }
  } catch {
    return null
  }
}

function normalizeRegistryUrl(value?: string | null): string {
  const fallback = trimTrailingSlash(CLAWHUB_API_BASE)
  const base = value?.trim() || fallback

  try {
    const parsed = new URL(base)
    const normalizedPath = trimTrailingSlash(parsed.pathname)

    if (normalizedPath.endsWith('/api/v1')) {
      parsed.pathname = normalizedPath
      return trimTrailingSlash(parsed.toString())
    }

    if (normalizedPath.endsWith('/api')) {
      parsed.pathname = `${normalizedPath}/v1`
      return trimTrailingSlash(parsed.toString())
    }

    parsed.pathname = `${normalizedPath || ''}/api/v1`
    return trimTrailingSlash(parsed.toString())
  } catch {
    return fallback
  }
}

function normalizeRegistryDisplayUrl(value?: string | null): string {
  const fallback = trimTrailingSlash(CLAWHUB_API_BASE.replace(/\/api\/v1$/, ''))
  const base = value?.trim() || fallback

  try {
    const parsed = new URL(base)
    const normalizedPath = trimTrailingSlash(parsed.pathname)

    if (normalizedPath.endsWith('/api/v1')) {
      parsed.pathname = normalizedPath.slice(0, -'/api/v1'.length) || '/'
    } else if (normalizedPath.endsWith('/api')) {
      parsed.pathname = normalizedPath.slice(0, -'/api'.length) || '/'
    } else {
      parsed.pathname = normalizedPath || '/'
    }

    return trimTrailingSlash(parsed.toString())
  } catch {
    return fallback
  }
}

async function getClawhubRequestContext(): Promise<{
  registry: string
  displayRegistry: string
  token?: string
}> {
  const config = await readClawhubGlobalConfig()
  const token = config?.token?.trim() || undefined
  return {
    registry: normalizeRegistryUrl(config?.registry),
    displayRegistry: normalizeRegistryDisplayUrl(config?.registry),
    token,
  }
}

async function fetchClawhubWhoami(
  registry: string,
  token: string,
  displayRegistry: string,
): Promise<ClawhubAuthStatus> {
  try {
    const res = await fetch(`${registry}/whoami`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'ClawBox/1.0',
      },
    })

    if (!res.ok) {
      const detail = trimText(await res.text().catch(() => ''), 180)
      if (res.status === 401 || res.status === 403) {
        return {
          hasToken: true,
          verified: false,
          registry: displayRegistry,
          code: 'invalid_token',
          error: detail || 'ClawHub token is invalid or expired',
        }
      }

      return {
        hasToken: true,
        verified: false,
        registry: displayRegistry,
        code: 'upstream',
        error: detail || `ClawHub auth check failed (${res.status})`,
      }
    }

    const data = await res.json() as {
      user?: {
        handle?: string | null
        displayName?: string | null
      }
    }

    return {
      hasToken: true,
      verified: true,
      registry: displayRegistry,
      handle: typeof data?.user?.handle === 'string' ? data.user.handle : null,
      displayName: typeof data?.user?.displayName === 'string' ? data.user.displayName : null,
    }
  } catch (error) {
    return {
      hasToken: true,
      verified: false,
      registry: displayRegistry,
      code: 'network',
      error: trimText(error instanceof Error ? error.message : String(error), 180),
    }
  }
}

function buildRuntimeEnv(runtime: NodeRuntime): NodeJS.ProcessEnv {
  const baseEnv = (plat === 'win32' && runtime.source === 'system')
    ? getWindowsNvmEnv()
    : { ...process.env, HOME: homedir() }
  const sep = plat === 'win32' ? ';' : ':'
  const currentPath = baseEnv.PATH || process.env.PATH || ''

  return {
    ...baseEnv,
    HOME: homedir(),
    PATH: [runtime.binDir, currentPath].filter(Boolean).join(sep),
  }
}

function extractVersion(stdout: string, stderr: string): string | undefined {
  const combined = `${stdout}\n${stderr}`
  const match = combined.match(/\bv?\d+\.\d+\.\d+(?:[-+][\w.]+)?\b/)
  return match?.[0]?.replace(/^v/i, '')
}

function getClawhubPackageCandidate(runtime: NodeRuntime): string | null {
  const prefixDir = runtime.source === 'portable'
    ? (plat === 'win32' ? runtime.binDir : join(runtime.binDir, '..'))
    : plat === 'win32'
      ? join(runtime.binDir, 'node_modules', 'clawhub')
      : join(runtime.binDir, '..', 'lib', 'node_modules', 'clawhub')

  return existsSync(prefixDir) ? prefixDir : null
}

function sanitizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase()
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    throw new Error('Invalid skill slug')
  }
  return normalized
}

function sanitizeVersion(version?: string): string | undefined {
  const normalized = version?.trim()
  if (!normalized) return undefined
  if (!/^[a-zA-Z0-9._-]+$/.test(normalized)) {
    throw new Error('Invalid skill version')
  }
  return normalized
}

function classifyClawhubAuthError(error: unknown): ClawhubAuthActionError {
  const message = trimText(error instanceof Error ? error.message : String(error), 240)
    || 'ClawHub authentication failed'
  const code = /401|403|unauthorized|forbidden|invalid token|login failed/i.test(message)
    ? 'invalid_token'
    : 'upstream'
  return new ClawhubAuthActionError(message, code)
}

function classifyClawhubInstallError(error: unknown): ClawhubInstallError {
  const message = trimText(error instanceof Error ? error.message : String(error), 240)
    || 'ClawHub installation failed'
  const code = /use --force to install suspicious skills in non-interactive mode|flagged as suspicious|suspicious skills/i.test(message)
    ? 'requires_force'
    : 'upstream'
  return new ClawhubInstallError(message, code)
}

async function runClawhubCommand(params: {
  command?: string
  args: string[]
  runtime: NodeRuntime
  cwd?: string
  timeoutMs?: number
}): Promise<{ stdout: string; stderr: string }> {
  const command = params.command || CLAWHUB_COMMAND
  const timeoutMs = params.timeoutMs ?? 120000
  const env = buildRuntimeEnv(params.runtime)

  return await new Promise((resolve, reject) => {
    const child = spawn(command, params.args, {
      cwd: params.cwd,
      env,
      shell: plat === 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      if (timedOut) {
        reject(new Error('ClawHub command timed out'))
        return
      }

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      reject(new Error(trimText(stderr || stdout) || `ClawHub exited with code ${code}`))
    })
  })
}

async function probeClawhubCli(runtime: NodeRuntime): Promise<{ command: string; version?: string } | null> {
  try {
    const result = await runClawhubCommand({
      runtime,
      args: ['--cli-version'],
      timeoutMs: 10000,
    })
    return {
      command: CLAWHUB_COMMAND,
      version: extractVersion(result.stdout, result.stderr),
    }
  } catch {
    return null
  }
}

async function ensureClawhubCli(lang?: string): Promise<{ runtime: NodeRuntime; command: string; version?: string }> {
  const runtime = await detectNodeRuntime()
  if (!runtime) {
    throw new Error('Node.js runtime is not ready')
  }

  const existing = await probeClawhubCli(runtime)
  if (existing) {
    return { runtime, ...existing }
  }

  log.info(`ClawHub CLI not found, installing via npm (${runtime.source})`)
  await npmInstallGlobal(runtime, 'clawhub', normalizeLang(lang))

  const installed = await probeClawhubCli(runtime)
  if (!installed) {
    const pkgPath = getClawhubPackageCandidate(runtime)
    throw new Error(pkgPath
      ? `ClawHub CLI installation finished, but the binary was not found at ${pkgPath}`
      : 'ClawHub CLI installation finished, but the binary was not found')
  }

  return { runtime, ...installed }
}

function normalizeSearchItem(raw: any): ClawhubSearchItem | null {
  const slug = typeof raw?.slug === 'string' ? raw.slug.trim() : ''
  if (!slug) return null

  const updatedAt = typeof raw?.updatedAt === 'number'
    ? raw.updatedAt
    : typeof raw?.updatedAt === 'string' && raw.updatedAt.trim()
      ? Date.parse(raw.updatedAt)
      : null

  return {
    score: typeof raw?.score === 'number' ? raw.score : 0,
    slug,
    displayName: typeof raw?.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName.trim()
      : slug,
    summary: trimText(typeof raw?.summary === 'string' ? raw.summary : '', 320),
    version: typeof raw?.version === 'string' && raw.version.trim() ? raw.version.trim() : null,
    updatedAt: Number.isFinite(updatedAt) ? Number(updatedAt) : null,
  }
}

export async function getClawhubCliStatus(): Promise<ClawhubCliStatus> {
  const runtime = await detectNodeRuntime()
  if (!runtime) {
    return { available: false, autoInstallable: false }
  }

  const existing = await probeClawhubCli(runtime)
  return {
    available: Boolean(existing),
    version: existing?.version,
    runtimeSource: runtime.source,
    autoInstallable: true,
  }
}

export async function installClawhubCli(lang?: string): Promise<ClawhubCliStatus> {
  const ensured = await ensureClawhubCli(lang)
  return {
    available: true,
    version: ensured.version,
    runtimeSource: ensured.runtime.source,
    autoInstallable: true,
  }
}

export async function getClawhubAuthStatus(): Promise<ClawhubAuthStatus> {
  const { registry, displayRegistry, token } = await getClawhubRequestContext()

  if (!token) {
    return {
      hasToken: false,
      verified: false,
      registry: displayRegistry,
      code: 'not_logged_in',
    }
  }

  return fetchClawhubWhoami(registry, token, displayRegistry)
}

export async function loginClawhub(params: {
  token: string
  lang?: string
}): Promise<ClawhubAuthStatus> {
  const token = params.token.trim()
  if (!token) {
    throw new Error('ClawHub token is required')
  }

  const ensured = await ensureClawhubCli(params.lang)
  try {
    await runClawhubCommand({
      command: ensured.command,
      args: ['login', '--token', token, '--no-browser', '--no-input'],
      runtime: ensured.runtime,
      timeoutMs: 30000,
    })
  } catch (error) {
    throw classifyClawhubAuthError(error)
  }

  return await getClawhubAuthStatus()
}

export async function loginClawhubInBrowser(params?: {
  lang?: string
  label?: string
}): Promise<ClawhubAuthStatus> {
  const ensured = await ensureClawhubCli(params?.lang)
  const label = params?.label?.trim() || 'WrapperBox'

  await runClawhubCommand({
    command: ensured.command,
    args: ['login', '--label', label],
    runtime: ensured.runtime,
    timeoutMs: 5 * 60_000,
  })

  return await getClawhubAuthStatus()
}

export async function logoutClawhub(lang?: string): Promise<ClawhubAuthStatus> {
  const ensured = await ensureClawhubCli(lang)
  await runClawhubCommand({
    command: ensured.command,
    args: ['logout'],
    runtime: ensured.runtime,
    timeoutMs: 15000,
  })

  return await getClawhubAuthStatus()
}

export async function searchClawhub(query: string, limit = 12): Promise<{ results: ClawhubSearchItem[] }> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return { results: [] }
  }

  const normalizedLimit = Math.min(Math.max(Math.trunc(limit) || 12, 1), 24)
  const { registry, token } = await getClawhubRequestContext()
  const cacheKey = buildSearchCacheKey(`${registry}\n${normalizedQuery}`, normalizedLimit)
  const cached = getCachedSearch(cacheKey)
  if (cached) {
    return { results: cached }
  }

  const url = `${registry}/search?q=${encodeURIComponent(normalizedQuery)}&limit=${normalizedLimit}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'ClawBox/1.0',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  })

  if (!res.ok) {
    const detail = trimText(await res.text().catch(() => ''), 180)
    if (res.status === 429 || /rate limit|too many requests/i.test(detail)) {
      throw new ClawhubSearchError('ClawHub search is temporarily rate limited', {
        status: res.status,
        code: 'rate_limit',
        retryAfterSeconds: parseRetryAfterSeconds(res.headers.get('retry-after')),
      })
    }

    throw new ClawhubSearchError(detail || `ClawHub search failed (${res.status})`, {
      status: res.status,
      code: 'upstream',
    })
  }

  const data = await res.json() as { results?: any[] }
  const results = Array.isArray(data?.results)
    ? data.results.map(normalizeSearchItem).filter((item): item is ClawhubSearchItem => Boolean(item))
    : []

  setCachedSearch(cacheKey, results)

  return { results }
}

export async function installClawhubSkill(params: {
  slug: string
  workspaceDir: string
  version?: string
  lang?: string
  force?: boolean
}): Promise<{ ok: true; message: string }> {
  const slug = sanitizeSlug(params.slug)
  const version = sanitizeVersion(params.version)
  const workspaceDir = params.workspaceDir.trim()

  if (!workspaceDir) {
    throw new Error('Workspace directory is not configured')
  }

  const ensured = await ensureClawhubCli(params.lang)
  const args = ['install', slug, '--workdir', workspaceDir, '--no-input']
  if (version) {
    args.push('--version', version)
  }
  if (params.force) {
    args.push('--force')
  }

  try {
    await runClawhubCommand({
      command: ensured.command,
      args,
      runtime: ensured.runtime,
      timeoutMs: 180000,
    })
  } catch (error) {
    throw classifyClawhubInstallError(error)
  }

  return {
    ok: true,
    message: `Installed ${slug}. Start a new OpenClaw session to load it.`,
  }
}
