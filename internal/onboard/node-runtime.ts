import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'
import extract from 'extract-zip'
import compatibility from '../compatibility.json'
import { plat, CMD_EXE, getNodePlatformArch, getNodeArchiveName } from './platform'
import { TARGET_OPENCLAW_VERSION } from './constants'
import { compareVersions, execAsync, log } from './utils'

const TARGET_NODE_VERSION = (compatibility as any).node.targetVersion as string

export interface NodeRuntime {
  nodeBin: string       // full path to node executable
  npmBin: string        // full path to npm (Windows: npm.cmd)
  version: string       // e.g. "v24.14.0"
  source: 'system' | 'portable'
  binDir: string        // directory containing node, used for PATH
}

export interface PortableRuntimeManifest {
  formatVersion: number
  nodeVersion: string
  openclawVersion: string
}

const RUNTIME_BASE = join(homedir(), '.clawbox', 'runtime', 'node')
const NPM_CACHE_BASE = join(homedir(), '.clawbox', 'cache', 'npm')
const PORTABLE_RUNTIME_MANIFEST = 'clawbox-runtime.json'
const PORTABLE_RUNTIME_FORMAT_VERSION = 1

/**
 * Get the expected portable Node.js directory name.
 * macOS/Linux: node-v24.14.0-darwin-arm64
 * Windows:     node-v24.14.0-win-x64
 */
function getPortableDirName(version: string): string {
  return `node-v${version}-${getNodePlatformArch()}`
}

function normalizeNodeVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

function getExpectedPortableNodeDir(): string {
  return join(RUNTIME_BASE, getPortableDirName(TARGET_NODE_VERSION))
}

export function getPortableRuntimeDir(runtime: NodeRuntime): string | null {
  if (runtime.source !== 'portable') return null
  return plat === 'win32' ? runtime.binDir : resolve(runtime.binDir, '..')
}

function getPortableOpenclawBin(nodeDir: string): string {
  return plat === 'win32'
    ? join(nodeDir, 'openclaw.cmd')
    : join(nodeDir, 'bin', 'openclaw')
}

export function getPortableRuntimeManifestPath(runtimeOrDir: NodeRuntime | string): string {
  const nodeDir = typeof runtimeOrDir === 'string'
    ? runtimeOrDir
    : (getPortableRuntimeDir(runtimeOrDir) || '')
  return join(nodeDir, PORTABLE_RUNTIME_MANIFEST)
}

export function readPortableRuntimeManifest(runtimeOrDir: NodeRuntime | string): PortableRuntimeManifest | null {
  try {
    const manifestPath = getPortableRuntimeManifestPath(runtimeOrDir)
    if (!existsSync(manifestPath)) return null
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    if (
      typeof raw?.formatVersion !== 'number' ||
      typeof raw?.nodeVersion !== 'string' ||
      typeof raw?.openclawVersion !== 'string'
    ) {
      return null
    }
    return raw as PortableRuntimeManifest
  } catch {
    return null
  }
}

function writePortableRuntimeManifest(nodeDir: string): void {
  const manifest: PortableRuntimeManifest = {
    formatVersion: PORTABLE_RUNTIME_FORMAT_VERSION,
    nodeVersion: `v${TARGET_NODE_VERSION}`,
    openclawVersion: TARGET_OPENCLAW_VERSION,
  }
  writeFileSync(getPortableRuntimeManifestPath(nodeDir), JSON.stringify(manifest, null, 2), 'utf-8')
}

export function hasExpectedPortableRuntime(runtime: NodeRuntime | null): boolean {
  if (!runtime || runtime.source !== 'portable') return false
  const nodeDir = getPortableRuntimeDir(runtime)
  if (!nodeDir) return false
  const manifest = readPortableRuntimeManifest(nodeDir)
  if (!manifest) return false
  if (manifest.formatVersion !== PORTABLE_RUNTIME_FORMAT_VERSION) return false
  if (normalizeNodeVersion(manifest.nodeVersion) !== `v${TARGET_NODE_VERSION}`) return false
  if (compareVersions(manifest.openclawVersion, TARGET_OPENCLAW_VERSION) !== 0) return false
  return existsSync(getPortableOpenclawBin(nodeDir))
}

/**
 * Detect an available Node.js runtime.
 * Priority: system Node.js 24 → already-extracted portable Node.
 */
export async function detectNodeRuntime(): Promise<NodeRuntime | null> {
  // 1. Check system Node.js
  const system = await detectSystemNode()
  if (system) return system

  // 2. Check existing portable Node
  const portable = detectPortableNode()
  if (portable) return portable

  return null
}

async function detectSystemNode(): Promise<NodeRuntime | null> {
  try {
    let cmd: string
    let shell: string | undefined
    if (plat === 'win32') {
      cmd = 'node --version'
      shell = CMD_EXE
    } else {
      // Source nvm in case system node is managed by nvm
      cmd = 'source ~/.nvm/nvm.sh 2>/dev/null; node --version'
      shell = plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash')
    }

    const { stdout } = await execAsync(cmd, {
      shell,
      timeout: 5000,
      env: { ...process.env, HOME: homedir() },
    })
    const ver = stdout.trim()
    if (!ver || !/^v24\./.test(ver)) return null

    // Find actual node path
    let nodeBin = 'node'
    let binDir = ''
    if (plat === 'win32') {
      try {
        const { stdout: wherePath } = await execAsync('where node', { shell: CMD_EXE, timeout: 5000 })
        nodeBin = wherePath.trim().split(/\r?\n/)[0]?.trim() || 'node'
        binDir = resolve(nodeBin, '..')
      } catch {
        binDir = ''
      }
    } else {
      try {
        const whichCmd = 'source ~/.nvm/nvm.sh 2>/dev/null; which node'
        const { stdout: whichPath } = await execAsync(whichCmd, {
          shell,
          timeout: 5000,
          env: { ...process.env, HOME: homedir() },
        })
        nodeBin = whichPath.trim() || 'node'
        binDir = resolve(nodeBin, '..')
      } catch {
        binDir = ''
      }
    }

    const npmBin = plat === 'win32'
      ? (binDir ? join(binDir, 'npm.cmd') : 'npm.cmd')
      : (binDir ? join(binDir, 'npm') : 'npm')

    log.info(`Detected system Node.js: ${ver} at ${nodeBin}`)
    return { nodeBin, npmBin, version: ver, source: 'system', binDir }
  } catch {
    return null
  }
}

export function detectPortableNode(): NodeRuntime | null {
  const dirName = getPortableDirName(TARGET_NODE_VERSION)
  const nodeDir = join(RUNTIME_BASE, dirName)

  if (!existsSync(nodeDir)) return null

  if (plat === 'win32') {
    const nodeBin = join(nodeDir, 'node.exe')
    const npmBin = join(nodeDir, 'npm.cmd')
    if (!existsSync(nodeBin)) return null
    log.info(`Detected portable Node.js at ${nodeDir}`)
    return { nodeBin, npmBin, version: `v${TARGET_NODE_VERSION}`, source: 'portable', binDir: nodeDir }
  } else {
    const nodeBin = join(nodeDir, 'bin', 'node')
    const npmBin = join(nodeDir, 'bin', 'npm')
    if (!existsSync(nodeBin)) return null
    log.info(`Detected portable Node.js at ${nodeDir}`)
    return { nodeBin, npmBin, version: `v${TARGET_NODE_VERSION}`, source: 'portable', binDir: join(nodeDir, 'bin') }
  }
}

async function hydratePortableRuntime(runtime: NodeRuntime, lang: string, onLog?: (message: string) => void): Promise<NodeRuntime> {
  log.info('Portable runtime missing bundled openclaw, hydrating runtime in development mode')
  onLog?.(lang === 'zh' ? '正在通过 npm 安装 openclaw...' : 'Installing openclaw via npm...')
  await npmInstallGlobal(runtime, `openclaw@${TARGET_OPENCLAW_VERSION}`, lang)
  const nodeDir = getPortableRuntimeDir(runtime)
  if (nodeDir) {
    writePortableRuntimeManifest(nodeDir)
  }
  const refreshed = detectPortableNode()
  if (!refreshed || !hasExpectedPortableRuntime(refreshed)) {
    throw new Error(lang === 'zh'
      ? 'portable runtime 补全失败：openclaw 未正确安装'
      : 'Portable runtime hydration failed: openclaw was not installed correctly')
  }
  return refreshed
}

/**
 * Extract portable runtime from network download.
 * Always downloads Node.js and installs OpenClaw from network.
 */
export async function extractPortableNode(
  lang: string,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<NodeRuntime> {
  const archiveName = getNodeArchiveName(TARGET_NODE_VERSION)
  const nodeDir = getExpectedPortableNodeDir()
  const force = options.force === true
  const onLog = options.onLog || (() => {})

  const existing = detectPortableNode()
  if (existing && !force && hasExpectedPortableRuntime(existing)) return existing

  mkdirSync(RUNTIME_BASE, { recursive: true })

  if (force || existing || existsSync(nodeDir)) {
    onLog(lang === 'zh' ? '正在清理旧版本...' : 'Cleaning up old version...')
    rmSync(nodeDir, { recursive: true, force: true })
  }

  // Always download from network
  const tmpDir = join(homedir(), '.clawbox', 'tmp')
  mkdirSync(tmpDir, { recursive: true })
  const tmpArchive = join(tmpDir, archiveName)

  if (!existsSync(tmpArchive)) {
    onLog(lang === 'zh' ? `正在下载 Node.js v${TARGET_NODE_VERSION}...` : `Downloading Node.js v${TARGET_NODE_VERSION}...`)
    await downloadNodeArchive(archiveName, tmpArchive, lang, onLog)
    onLog(lang === 'zh' ? `Node.js 下载完成` : `Node.js download complete`)
  } else {
    onLog(lang === 'zh' ? `使用缓存的 Node.js 压缩包` : `Using cached Node.js archive`)
  }

  onLog(lang === 'zh' ? `正在解压 Node.js...` : `Extracting Node.js...`)
  await extractArchive(tmpArchive, RUNTIME_BASE)
  onLog(lang === 'zh' ? `Node.js 解压完成` : `Node.js extraction complete`)

  let runtime = detectPortableNode()
  if (!runtime) {
    throw new Error(lang === 'zh'
      ? `Node.js 解压失败：${nodeDir} 中未找到 node 可执行文件`
      : `Node.js extraction failed: node binary not found in ${nodeDir}`)
  }

  // Always install OpenClaw from network
  onLog(lang === 'zh' ? `正在安装 openclaw@${TARGET_OPENCLAW_VERSION}...` : `Installing openclaw@${TARGET_OPENCLAW_VERSION}...`)
  runtime = await hydratePortableRuntime(runtime, lang, onLog)
  onLog(lang === 'zh' ? `openclaw 安装完成` : `openclaw installation complete`)

  return runtime
}

async function downloadNodeArchive(archiveName: string, destPath: string, lang: string, onLog?: (message: string) => void): Promise<void> {
  const version = TARGET_NODE_VERSION
  const urls = lang === 'zh'
    ? [
        `https://npmmirror.com/mirrors/node/v${version}/${archiveName}`,
        `https://nodejs.org/dist/v${version}/${archiveName}`,
      ]
    : [
        `https://nodejs.org/dist/v${version}/${archiveName}`,
        `https://npmmirror.com/mirrors/node/v${version}/${archiveName}`,
      ]

  let lastErr: Error | null = null
  for (const url of urls) {
    try {
      const urlHost = new URL(url).hostname
      onLog?.(lang === 'zh' ? `正在从 ${urlHost} 下载...` : `Downloading from ${urlHost}...`)
      log.info(`Downloading Node.js from ${url}`)
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const buf = await resp.arrayBuffer()
      const { writeFileSync } = await import('fs')
      writeFileSync(destPath, Buffer.from(buf))
      log.info(`Downloaded Node.js to ${destPath}`)
      onLog?.(lang === 'zh' ? `下载完成 (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)` : `Download complete (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB)`)
      return
    } catch (e: any) {
      lastErr = e
      log.warn(`Download failed from ${url}: ${e.message}`)
      onLog?.(lang === 'zh' ? `下载失败，尝试备用源...` : `Download failed, trying fallback...`)
    }
  }

  throw new Error(lang === 'zh'
    ? `Node.js 下载失败: ${lastErr?.message}`
    : `Failed to download Node.js: ${lastErr?.message}`)
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    // Windows: use extract-zip (handles long paths better than PowerShell)
    mkdirSync(destDir, { recursive: true })
    await extract(archivePath, { dir: resolve(destDir) })
  } else {
    // macOS/Linux: tar
    await execAsync(
      `tar -xzf "${archivePath}" -C "${destDir}"`,
      { shell: '/bin/sh', timeout: 120000 }
    )
  }
  log.info(`Extracted ${archivePath} to ${destDir}`)
}

export function getInstallRegistryForLang(lang: string): string {
  return lang === 'zh'
    ? 'https://registry.npmmirror.com'
    : 'https://registry.npmjs.org'
}

export function getRuntimeInstallPrefix(runtime: NodeRuntime): string | null {
  if (runtime.source !== 'portable') return null
  return plat === 'win32' ? runtime.binDir : resolve(runtime.binDir, '..')
}

function getRuntimeNpmCacheDir(runtime: NodeRuntime): string {
  if (runtime.source === 'portable') {
    return join(NPM_CACHE_BASE, getPortableDirName(TARGET_NODE_VERSION))
  }
  return join(NPM_CACHE_BASE, 'system')
}

/**
 * Install a global npm package using the specified runtime.
 * Uses --registry to pass the mirror URL instead of modifying global npm config.
 */
export async function npmInstallGlobal(
  runtime: NodeRuntime,
  pkg: string,
  lang: string,
): Promise<{ stdout: string; stderr: string }> {
  const registry = getInstallRegistryForLang(lang)
  const installPrefix = getRuntimeInstallPrefix(runtime)
  const npmCacheDir = getRuntimeNpmCacheDir(runtime)

  // Build PATH with runtime's binDir at front
  const sep = plat === 'win32' ? ';' : ':'
  const envPath = `${runtime.binDir}${sep}${process.env.PATH || ''}`

  mkdirSync(npmCacheDir, { recursive: true })

  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: envPath,
    HOME: homedir(),
    NPM_CONFIG_CACHE: npmCacheDir,
    npm_config_cache: npmCacheDir,
  }

  if (plat === 'win32') {
    env.NPM_CONFIG_SCRIPT_SHELL = CMD_EXE
    env.NPM_CONFIG_LOGLEVEL = 'error'
    env.NPM_CONFIG_UPDATE_NOTIFIER = 'false'
    env.NPM_CONFIG_FUND = 'false'
    env.NPM_CONFIG_AUDIT = 'false'
  }

  if (installPrefix) {
    // Force global installs into the portable runtime, regardless of any
    // inherited npm config or shell environment from the host machine.
    env.NPM_CONFIG_PREFIX = installPrefix
    env.npm_config_prefix = installPrefix
    env.PREFIX = installPrefix
  }

  const shell = plat === 'win32' ? CMD_EXE : (process.env.SHELL || '/bin/sh')
  const prefixArg = installPrefix ? ` --prefix="${installPrefix}"` : ''
  const installCmd = `"${runtime.npmBin}" install -g ${pkg} --registry=${registry} --loglevel=error${prefixArg}`

  log.info(`npm install: ${installCmd}`)
  return execAsync(installCmd, {
    shell,
    timeout: 180000,
    env: env as any,
  })
}
