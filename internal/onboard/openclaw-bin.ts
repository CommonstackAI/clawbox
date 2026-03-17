import { existsSync, readFileSync, readdirSync, realpathSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { homedir } from 'os'
import { plat, CMD_EXE } from './platform'
import { execAsync, log } from './utils'
import { getWindowsNvmEnv, execWithNvm, refreshWindowsPath } from './windows-env'

const RUNTIME_BASE = join(homedir(), '.wrapperbox', 'runtime', 'node')
const MISSING_PORTABLE_DIR = '_missing_portable_openclaw'

export type OpenclawResolveMode = 'auto' | 'portable' | 'system'

export interface PortableOpenclawLaunch {
  runtimeDir: string
  nodeBin: string
  binPath: string
  entryPath: string
}

function isPortableBinPath(bin: string): boolean {
  return bin.includes(join('.wrapperbox', 'runtime', 'node'))
}

function shouldSkipSystemCandidate(mode: OpenclawResolveMode, bin: string): boolean {
  return mode === 'system' && isPortableBinPath(bin)
}

function isPathLookupFallback(bin: string): boolean {
  return bin === 'openclaw' || bin === 'openclaw.cmd'
}

function addUniquePath(list: string[], value?: string | null): void {
  if (!value) return
  const normalized = value.trim().replace(/[\\/]+$/, '')
  if (!normalized || list.includes(normalized)) return
  list.push(normalized)
}

function expandHomePath(value: string): string | null {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '')
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null

  let expanded = trimmed
  if (expanded === '~') expanded = homedir()
  else if (expanded.startsWith('~/')) expanded = join(homedir(), expanded.slice(2))

  expanded = expanded.replace(/^\$HOME(?=\/|$)/, homedir())
  expanded = expanded.replace(/^\$\{HOME\}(?=\/|$)/, homedir())
  return expanded
}

function appendSubdir(base: string | null | undefined, subdir: string): string | null {
  if (!base) return null
  const expanded = expandHomePath(base)
  if (!expanded) return null
  return expanded.endsWith(`/${subdir}`) ? expanded : join(expanded, subdir)
}

function readConfiguredNpmPrefixes(): string[] {
  const configPaths: string[] = []
  addUniquePath(configPaths, process.env.NPM_CONFIG_USERCONFIG)
  addUniquePath(configPaths, join(homedir(), '.npmrc'))
  addUniquePath(configPaths, join(homedir(), '.config', 'npm', 'npmrc'))

  const prefixes: string[] = []
  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue
    try {
      const lines = readFileSync(configPath, 'utf-8').split(/\r?\n/)
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#') || line.startsWith(';')) continue
        const match = line.match(/^prefix\s*=\s*(.+)$/)
        if (!match?.[1]) continue
        const prefix = expandHomePath(match[1])
        if (prefix) addUniquePath(prefixes, prefix)
      }
    } catch {}
  }

  return prefixes
}

function listSystemOpenclawBinDirs(): string[] {
  if (plat === 'win32') return []

  const dirs: string[] = []
  const home = homedir()

  addUniquePath(dirs, process.env.PNPM_HOME)
  addUniquePath(dirs, appendSubdir(process.env.NPM_CONFIG_PREFIX, 'bin'))
  addUniquePath(dirs, appendSubdir(process.env.BUN_INSTALL, 'bin'))
  addUniquePath(dirs, appendSubdir(process.env.VOLTA_HOME, 'bin'))
  addUniquePath(dirs, appendSubdir(process.env.ASDF_DATA_DIR, 'shims'))

  for (const prefix of readConfiguredNpmPrefixes()) {
    addUniquePath(dirs, appendSubdir(prefix, 'bin'))
  }

  addUniquePath(dirs, join(home, '.local', 'bin'))
  addUniquePath(dirs, join(home, '.npm-global', 'bin'))
  addUniquePath(dirs, join(home, 'bin'))
  addUniquePath(dirs, join(home, '.volta', 'bin'))
  addUniquePath(dirs, join(home, '.asdf', 'shims'))
  addUniquePath(dirs, join(home, '.bun', 'bin'))

  if (plat === 'darwin') {
    addUniquePath(dirs, appendSubdir(process.env.FNM_DIR, 'aliases/default/bin'))
    addUniquePath(dirs, join(home, 'Library', 'Application Support', 'fnm', 'aliases', 'default', 'bin'))
    addUniquePath(dirs, join(home, '.fnm', 'aliases', 'default', 'bin'))
    addUniquePath(dirs, join(home, 'Library', 'pnpm'))
    addUniquePath(dirs, join(home, '.local', 'share', 'pnpm'))
    addUniquePath(dirs, '/opt/homebrew/bin')
    addUniquePath(dirs, '/usr/local/bin')
    addUniquePath(dirs, '/usr/bin')
    addUniquePath(dirs, '/bin')
    return dirs
  }

  addUniquePath(dirs, appendSubdir(process.env.NVM_DIR, 'current/bin'))
  addUniquePath(dirs, appendSubdir(process.env.FNM_DIR, 'current/bin'))
  addUniquePath(dirs, join(home, '.nvm', 'current', 'bin'))
  addUniquePath(dirs, join(home, '.fnm', 'current', 'bin'))
  addUniquePath(dirs, join(home, '.local', 'share', 'pnpm'))
  addUniquePath(dirs, '/usr/local/bin')
  addUniquePath(dirs, '/usr/bin')
  addUniquePath(dirs, '/bin')

  return dirs
}

export function listSystemOpenclawCandidatePaths(): string[] {
  const binName = plat === 'win32' ? 'openclaw.cmd' : 'openclaw'
  return listSystemOpenclawBinDirs().map(dir => join(dir, binName))
}

function listSystemNodeCandidatePaths(): string[] {
  const nodeName = plat === 'win32' ? 'node.exe' : 'node'
  const candidates = listSystemOpenclawBinDirs().map(dir => join(dir, nodeName))

  if (plat !== 'win32') {
    addUniquePath(candidates, join(homedir(), '.nvm', 'current', 'bin', nodeName))
    const nvmCurrent = appendSubdir(process.env.NVM_DIR, 'current/bin')
    if (nvmCurrent) addUniquePath(candidates, join(nvmCurrent, nodeName))
  }

  return candidates
}

async function findSystemNodeBinDir(): Promise<string | null> {
  if (plat === 'win32') return null

  const env = { ...process.env, HOME: homedir() }
  const loginShell = plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash')

  try {
    const { stdout } = await execAsync('command -v node', {
      shell: '/bin/sh',
      timeout: 3000,
      env,
    })
    const nodePath = stdout.trim().split(/\r?\n/)[0]?.trim()
    if (nodePath) return dirname(nodePath)
  } catch {}

  const nvmScript = join(homedir(), '.nvm', 'nvm.sh')
  if (existsSync(nvmScript)) {
    try {
      const { stdout } = await execAsync('. ~/.nvm/nvm.sh 2>/dev/null; which node', {
        shell: loginShell,
        timeout: 5000,
        env,
      })
      const nodePath = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (nodePath) return dirname(nodePath)
    } catch {}
  }

  const nvmDir = join(homedir(), '.nvm', 'versions', 'node')
  if (existsSync(nvmDir)) {
    try {
      const { stdout } = await execAsync(
        `ls "${nvmDir}"/*/bin/node 2>/dev/null | tail -1`,
        { shell: '/bin/sh', timeout: 3000, env }
      )
      const nodePath = stdout.trim()
      if (nodePath && existsSync(nodePath)) return dirname(nodePath)
    } catch {}
  }

  for (const candidate of listSystemNodeCandidatePaths()) {
    if (existsSync(candidate)) return dirname(candidate)
  }

  return null
}

function prependPathDirs(basePath: string, dirs: Array<string | null | undefined>, sep: string): string {
  const parts: string[] = []
  for (const dir of dirs) addUniquePath(parts, dir)
  for (const part of basePath.split(sep)) addUniquePath(parts, part)
  return parts.join(sep)
}

function listPortableRuntimeDirs(): string[] {
  try {
    if (!existsSync(RUNTIME_BASE)) return []
    return readdirSync(RUNTIME_BASE)
      .filter(d => d.startsWith('node-v'))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
      .map(d => join(RUNTIME_BASE, d))
  } catch {
    return []
  }
}

function getPortableRuntimeDirFromBin(bin: string): string | null {
  if (!isPortableBinPath(bin)) return null
  if (plat === 'win32') return dirname(bin)
  return dirname(dirname(bin))
}

function getPortableNodeBin(runtimeDir: string): string {
  return plat === 'win32'
    ? join(runtimeDir, 'node.exe')
    : join(runtimeDir, 'bin', 'node')
}

function getPortableOpenclawBinPath(runtimeDir: string): string {
  return plat === 'win32'
    ? join(runtimeDir, 'openclaw.cmd')
    : join(runtimeDir, 'bin', 'openclaw')
}

function getPortableOpenclawPackageDirs(runtimeDir: string): string[] {
  return [
    join(runtimeDir, 'lib', 'node_modules', 'openclaw'),
    join(runtimeDir, 'node_modules', 'openclaw'),
  ]
}

function resolvePackageBinEntry(pkgDir: string, pkgName: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'))
    const binField = pkg?.bin
    const rel = typeof binField === 'string'
      ? binField
      : (binField?.[pkgName] ?? Object.values(binField ?? {})[0])
    if (typeof rel !== 'string' || !rel) return null
    const entryPath = resolve(pkgDir, rel)
    return existsSync(entryPath) ? entryPath : null
  } catch {
    return null
  }
}

function resolvePortableOpenclawEntry(runtimeDir: string, binPath: string): string | null {
  if (existsSync(binPath)) {
    try {
      if (plat === 'win32' && binPath.endsWith('.cmd')) {
        const shim = readFileSync(binPath, 'utf-8')
        const m = shim.match(/node_modules[\\/][^\s"%\r\n]+\.(?:m|c)?js/i)
        if (m) {
          const entryPath = resolve(dirname(binPath), m[0])
          if (existsSync(entryPath)) return entryPath
        }
      } else {
        const entryPath = realpathSync(binPath)
        if (existsSync(entryPath)) return entryPath
      }
    } catch {}
  }

  for (const pkgDir of getPortableOpenclawPackageDirs(runtimeDir)) {
    const entryPath = resolvePackageBinEntry(pkgDir, 'openclaw')
    if (entryPath) return entryPath
  }

  for (const pkgDir of getPortableOpenclawPackageDirs(runtimeDir)) {
    for (const rel of ['openclaw.mjs', 'openclaw.js', 'dist/openclaw.mjs', 'dist/openclaw.js']) {
      const entryPath = join(pkgDir, rel)
      if (existsSync(entryPath)) return entryPath
    }
  }

  return null
}

export function resolvePortableOpenclawLaunch(bin?: string): PortableOpenclawLaunch | null {
  const candidates = [
    ...(bin ? [getPortableRuntimeDirFromBin(bin)] : []),
    ...listPortableRuntimeDirs(),
  ].filter((dir): dir is string => Boolean(dir))

  const visited = new Set<string>()
  for (const runtimeDir of candidates) {
    if (visited.has(runtimeDir)) continue
    visited.add(runtimeDir)

    const nodeBin = getPortableNodeBin(runtimeDir)
    if (!existsSync(nodeBin)) continue

    const binPath = getPortableOpenclawBinPath(runtimeDir)
    const entryPath = resolvePortableOpenclawEntry(runtimeDir, binPath)
    if (!entryPath) continue

    return { runtimeDir, nodeBin, binPath, entryPath }
  }

  return null
}

function portableMissingBinPath(): string {
  return plat === 'win32'
    ? join(RUNTIME_BASE, MISSING_PORTABLE_DIR, 'openclaw.cmd')
    : join(RUNTIME_BASE, MISSING_PORTABLE_DIR, 'bin', 'openclaw')
}

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '')
}

function extractVersion(stdout: string, stderr: string): string | undefined {
  const allLines = stripAnsi(`${stdout}\n${stderr}`)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)

  const preferred = [
    ...allLines.filter(l => /openclaw/i.test(l)),
    ...allLines,
  ]

  for (const line of preferred) {
    const m = line.match(/(?:^|[^0-9])v?(\d+\.\d+(?:\.\d+){0,3})(?:[^0-9]|$)/i)
    if (m?.[1]) return m[1]
  }
  return undefined
}

/**
 * Resolve the full path to the openclaw binary across platforms.
 * In portable mode, only search the app portable runtime and never fall back to system.
 */
export async function findOpenclawBin(mode: OpenclawResolveMode = 'auto'): Promise<string> {
  if (plat === 'win32') {
    await refreshWindowsPath()

    if (mode !== 'system') {
      const portableBin = findInPortableNode('openclaw.cmd')
      if (portableBin) return portableBin
      if (mode === 'portable') return portableMissingBinPath()
    }

    try {
      const env = getWindowsNvmEnv()
      for (const whereCmd of ['where openclaw.cmd', 'where openclaw']) {
        try {
          const { stdout } = await execAsync(whereCmd, { shell: CMD_EXE, timeout: 5000, env })
          const bin = stdout.trim().split(/\r?\n/)[0]?.trim()
          if (bin && !shouldSkipSystemCandidate(mode, bin)) return bin
        } catch {}
      }
    } catch {}

    const appData = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
    const nvmSym = process.env.NVM_SYMLINK || 'C:\\nvm4w\\nodejs'
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const candidates = [
      join(nvmSym, 'openclaw.cmd'),
      join(nvmSym, 'openclaw'),
      join(appData, 'npm', 'openclaw.cmd'),
      join(appData, 'npm', 'openclaw'),
      join(localAppData, 'npm', 'openclaw.cmd'),
      join(localAppData, 'npm', 'openclaw'),
      join(pf, 'nodejs', 'openclaw.cmd'),
      join(pfx86, 'nodejs', 'openclaw.cmd'),
      join(homedir(), 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
      join(homedir(), 'AppData', 'Roaming', 'npm', 'openclaw'),
    ]
    for (const c of candidates) {
      if (existsSync(c) && !shouldSkipSystemCandidate(mode, c)) return c
    }

    try {
      const { stdout } = await execAsync('npm root -g', { shell: CMD_EXE, timeout: 5000, env: getWindowsNvmEnv() })
      const globalDir = stdout.trim()
      if (globalDir) {
        const npmBinDir = dirname(globalDir)
        const binCandidate = join(npmBinDir, 'openclaw.cmd')
        if (existsSync(binCandidate) && !shouldSkipSystemCandidate(mode, binCandidate)) return binCandidate
      }
    } catch {}

    return 'openclaw.cmd'
  }

  if (mode !== 'system') {
    const portableBin = findInPortableNode('openclaw')
    if (portableBin) return portableBin
    if (mode === 'portable') return portableMissingBinPath()
  }

  // macOS / Linux: try login shell + nvm first
  const loginShell = plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash')

  // First try plain PATH resolution from current process env.
  // This covers non-nvm managers (fnm/asdf/homebrew custom prefixes).
  try {
    const { stdout } = await execAsync(
      'command -v openclaw',
      { shell: '/bin/sh', timeout: 3000, env: { ...process.env, HOME: homedir() } }
    )
    const bin = stdout.trim()
    if (bin && !shouldSkipSystemCandidate(mode, bin)) return bin
  } catch {}

  const nvmScript = join(homedir(), '.nvm', 'nvm.sh')
  if (existsSync(nvmScript)) {
    try {
      const { stdout } = await execAsync(
        '. ~/.nvm/nvm.sh 2>/dev/null; which openclaw',
        { shell: loginShell, timeout: 5000, env: { ...process.env, HOME: homedir() } }
      )
      const bin = stdout.trim()
      if (bin && !shouldSkipSystemCandidate(mode, bin)) return bin
    } catch {}
  }

  // Scan ~/.nvm/versions/node/*/bin/openclaw
  const nvmDir = join(homedir(), '.nvm', 'versions', 'node')
  if (existsSync(nvmDir)) {
    try {
      const { stdout } = await execAsync(
        `ls "${nvmDir}"/*/bin/openclaw 2>/dev/null | tail -1`,
        { shell: '/bin/sh', timeout: 3000 }
      )
      const bin = stdout.trim()
      if (bin && existsSync(bin) && !shouldSkipSystemCandidate(mode, bin)) return bin
    } catch {}
  }

  for (const c of listSystemOpenclawCandidatePaths()) {
    if (existsSync(c) && !shouldSkipSystemCandidate(mode, c)) return c
  }

  return 'openclaw'
}

/**
 * Scan ~/.wrapperbox/runtime/node/ for openclaw installed in portable Node.js.
 */
function findInPortableNode(binName: string): string | null {
  try {
    for (const nodeDir of listPortableRuntimeDirs()) {
      const candidates = plat === 'win32'
        ? [join(nodeDir, binName)]
        : [join(nodeDir, 'bin', binName)]
      for (const c of candidates) {
        if (existsSync(c)) {
          log.info(`findInPortableNode: found ${c}`)
          return c
        }
      }
    }
  } catch {}
  return null
}

export async function runOpenclawCmd(
  args: string,
  timeoutMs: number,
  mode: OpenclawResolveMode = 'auto',
): Promise<{ stdout: string; stderr: string }> {
  const bin = await findOpenclawBin(mode)
  const portableLaunch = (mode === 'portable' || isPortableBinPath(bin))
    ? resolvePortableOpenclawLaunch(bin)
    : null

  if (mode === 'portable' && !portableLaunch && !existsSync(bin)) {
    throw new Error('Portable openclaw not found')
  }

  const actualBin = portableLaunch ? portableLaunch.nodeBin : bin
  const actualArgs = portableLaunch
    ? [portableLaunch.entryPath, ...args.split(/\s+/).filter(Boolean)]
    : null
  const cmd = portableLaunch
    ? [`"${actualBin}"`, ...actualArgs!.map(arg => `"${arg.replace(/"/g, '\\"')}"`)].join(' ')
    : `"${bin}" ${args}`

  const binDir = (actualBin.includes('/') || actualBin.includes('\\')) ? dirname(actualBin) : ''
  const sep = plat === 'win32' ? ';' : ':'
  const shell = plat === 'win32' ? CMD_EXE : (process.env.SHELL || '/bin/sh')
  const baseEnv = (plat === 'win32' && mode !== 'portable')
    ? getWindowsNvmEnv()
    : { ...process.env, HOME: homedir() }
  const systemNodeBinDir = (!portableLaunch && mode !== 'portable' && plat !== 'win32')
    ? await findSystemNodeBinDir()
    : null
  const envPath = prependPathDirs(
    baseEnv.PATH || process.env.PATH || '',
    [binDir, systemNodeBinDir],
    sep,
  )

  return execAsync(cmd, {
    shell,
    env: { ...baseEnv, PATH: envPath, HOME: homedir() },
    timeout: timeoutMs,
  })
}

export async function checkNpmRegistry(): Promise<{ configured: boolean; current?: string }> {
  try {
    const { stdout } = await execWithNvm('npm config get registry', 10000)
    const reg = stdout.trim()
    const configured = reg.includes('npmmirror.com')
    return { configured, current: reg }
  } catch {
    return { configured: false }
  }
}

export async function checkOpenclawInstalled(mode: OpenclawResolveMode = 'auto'): Promise<{ installed: boolean; version?: string }> {
  try {
    const bin = await findOpenclawBin(mode)
    const portableLaunch = (mode === 'portable' || isPortableBinPath(bin))
      ? resolvePortableOpenclawLaunch(bin)
      : null
    log.info(`checkOpenclawInstalled(${mode}): bin=${bin}`)

    if (portableLaunch) {
      log.info(`checkOpenclawInstalled(${mode}): entry=${portableLaunch.entryPath}`)
    }

    if (mode === 'system' && isPortableBinPath(bin)) {
      log.info('checkOpenclawInstalled: portable binary resolved in system mode, treated as not installed')
      return { installed: false }
    }

    // Fast path: findOpenclawBin returns a PATH-lookup fallback marker when
    // no concrete binary path can be resolved. In this case we can return
    // immediately instead of running another expensive probe.
    if (mode !== 'portable' && !portableLaunch && isPathLookupFallback(bin)) {
      log.info('checkOpenclawInstalled: no resolved system binary, treated as not installed')
      return { installed: false }
    }

    if (mode === 'portable' && !portableLaunch && !existsSync(bin)) {
      log.info('checkOpenclawInstalled: portable binary not found')
      return { installed: false }
    }

    try {
      const isPortable = isPortableBinPath(bin)
      if (mode === 'portable' && !portableLaunch && !isPortable) {
        log.info('checkOpenclawInstalled: non-portable binary resolved in portable mode')
        return { installed: false }
      }
      const result = await runOpenclawCmd('--version', 10000, mode)

      const ver = extractVersion(result.stdout, result.stderr)
      if (ver) {
        log.info(`checkOpenclawInstalled: version=${ver}`)
        return { installed: true, version: ver }
      }

      const preview = stripAnsi((result.stdout + ' ' + result.stderr).trim()).slice(0, 200)
      log.info(`checkOpenclawInstalled: unexpected output: ${preview}`)
      return { installed: false }
    } catch (e: any) {
      log.info(`checkOpenclawInstalled: exec failed: ${e.message?.slice(0, 200)}`)
      return { installed: false }
    }
  } catch (e: any) {
    log.warn(`checkOpenclawInstalled error: ${e.message}`)
    return { installed: false }
  }
}

/**
 * Windows: ensure openclaw.cmd is on PATH after npm install -g.
 * Mirrors the official installer's Ensure-OpenClawOnPath logic:
 * checks npm prefix and %APPDATA%\npm, adds to user PATH if needed.
 */
export async function ensureOpenclawOnPath(): Promise<void> {
  if (plat !== 'win32') return
  const bin = await findOpenclawBin('system')
  if (bin !== 'openclaw' && bin !== 'openclaw.cmd') {
    log.info(`ensureOpenclawOnPath: already found at ${bin}`)
    return
  }

  let npmPrefix = ''
  try {
    const { stdout } = await execWithNvm('npm config get prefix', 10000)
    npmPrefix = stdout.trim()
  } catch {}

  const appDataNpm = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm')
  const nvmSym = process.env.NVM_SYMLINK || 'C:\\nvm4w\\nodejs'
  const candidates = [nvmSym, npmPrefix, join(npmPrefix, 'bin'), appDataNpm]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)

  for (const dir of candidates) {
    const cmdPath = join(dir, 'openclaw.cmd')
    if (!existsSync(cmdPath)) continue
    log.info(`ensureOpenclawOnPath: found openclaw.cmd at ${dir}`)

    const currentPath = process.env.PATH || ''
    if (!currentPath.toLowerCase().split(';').includes(dir.toLowerCase())) {
      process.env.PATH = `${dir};${currentPath}`
      log.info(`ensureOpenclawOnPath: added ${dir} to process PATH`)
    }
    return
  }

  log.warn('ensureOpenclawOnPath: openclaw.cmd not found in any candidate dir')
}
