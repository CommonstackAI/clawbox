import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { getConfig } from '../config/index'
import { plat, CMD_EXE } from './platform'
import { execAsync, log } from './utils'
import {
  OPENCLAW_CONFIG, GATEWAY_PORT,
  GATEWAY_PLIST, GATEWAY_SYSTEMD_UNIT, GATEWAY_TASK_SCRIPT,
} from './constants'
import {
  findOpenclawBin,
  resolvePortableOpenclawLaunch,
  runOpenclawCmd,
  type OpenclawResolveMode,
} from './openclaw-bin'
import { getWindowsNvmEnv } from './windows-env'

/** Check if the openclaw binary is installed inside portable Node.js runtime. */
function isPortableBin(bin: string): boolean {
  return bin.includes(join('.clawbox', 'runtime', 'node'))
}

function resolveOpenclawMode(mode?: OpenclawResolveMode): OpenclawResolveMode {
  if (mode) return mode
  const cfgMode = getConfig().envMode
  if (cfgMode === 'portable' || cfgMode === 'system') return cfgMode
  return 'auto'
}

// ── Gateway child process tracking ────────────────────────────────────────

const gatewayChildPids: number[] = []

/**
 * Resolve a .cmd shim to the real node.exe + JS entry, so we can spawn node directly
 * without going through cmd.exe (which causes console window flashes on Windows).
 */
function resolveCmdShim(bin: string): { nodeBin: string; entry: string } | null {
  if (!bin.endsWith('.cmd') || !existsSync(bin)) return null
  const binDir = dirname(bin)
  const nodeExe = join(binDir, 'node.exe')
  if (!existsSync(nodeExe)) return null

  // Strategy 1: read package.json bin field (authoritative)
  try {
    const pkgName = bin.slice(binDir.length + 1, -4)
    const pkg = JSON.parse(readFileSync(join(binDir, 'node_modules', pkgName, 'package.json'), 'utf-8'))
    const binField = pkg.bin
    const rel = typeof binField === 'string' ? binField : (binField?.[pkgName] ?? Object.values(binField ?? {})[0])
    if (rel) {
      const entry = join(binDir, 'node_modules', pkgName, rel as string)
      if (existsSync(entry)) return { nodeBin: nodeExe, entry }
    }
  } catch {}

  // Strategy 2: regex-parse the .cmd shim (.js / .mjs / .cjs)
  try {
    const m = readFileSync(bin, 'utf-8').match(/node_modules[\\/][^\s"%\r\n]+\.(?:m|c)?js/i)
    if (m) {
      const entry = join(binDir, m[0])
      if (existsSync(entry)) return { nodeBin: nodeExe, entry }
    }
  } catch {}

  return null
}

/**
 * On Windows, use PowerShell ProcessStartInfo with CreateNoWindow=true and
 * UseShellExecute=false. This is the most reliable way to suppress the console
 * window — it maps directly to Win32 CREATE_NO_WINDOW in CreateProcess and
 * bypasses Windows Terminal's new-console interception.
 *
 * The PowerShell command is base64-encoded (UTF-16LE) via -EncodedCommand to
 * avoid all shell escaping issues with paths containing spaces or backslashes.
 */
function spawnWindowsHidden(bin: string, args: string[], envOverrides: Record<string, string | undefined>): void {
  const esc = (s: string) => s.replace(/'/g, "''")  // PS single-quote escape

  // Merge overrides on top of current process.env so gateway inherits all system vars
  // (APPDATA, TEMP, USERPROFILE, SystemRoot, etc.). UseShellExecute=false does NOT
  // inherit parent env automatically in .NET — every needed var must be set explicitly.
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) merged[k] = v
  }
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v !== undefined) merged[k] = v
  }

  // ProcessStartInfo.Arguments: each arg double-quoted, backslashes not doubled
  const argsStr = args.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')

  // Build $psi.EnvironmentVariables assignments (clear first, then add all)
  const envLines = [
    `$psi.EnvironmentVariables.Clear()`,
    ...Object.entries(merged).map(([k, v]) => `$psi.EnvironmentVariables['${esc(k)}'] = '${esc(v)}'`),
  ]

  const script = [
    `$psi = New-Object System.Diagnostics.ProcessStartInfo`,
    `$psi.FileName = '${esc(bin)}'`,
    argsStr ? `$psi.Arguments = '${esc(argsStr)}'` : '',
    `$psi.WindowStyle = 'Hidden'`,
    `$psi.CreateNoWindow = $true`,
    `$psi.UseShellExecute = $false`,
    ...envLines,
    `[void][System.Diagnostics.Process]::Start($psi)`,
  ].filter(Boolean).join('\n')

  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  execAsync(
    `powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}`,
    { shell: CMD_EXE, timeout: 15000 },
  ).then(() => {
    log.info(`spawnWindowsHidden: started ${bin} ${args.join(' ')}`)
  }).catch(e => {
    log.warn(`spawnWindowsHidden: PowerShell failed (${e.message}), retrying with spawn`)
    // Last-resort fallback: plain spawn (may show a brief flash)
    const child = spawn(bin, args, {
      env: envOverrides as NodeJS.ProcessEnv,
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    })
    child.unref()
    if (child.pid) gatewayChildPids.push(child.pid)
  })
}

/** Spawn a gateway process hidden (no console window on Windows). */
function spawnGatewayHidden(bin: string, args: string[], env: Record<string, string | undefined>): number | undefined {
  if (plat === 'win32') {
    // Resolve .cmd shim → node.exe + entry to avoid launching through cmd.exe
    const resolved = resolveCmdShim(bin)
    const actualBin = resolved ? resolved.nodeBin : bin
    const actualArgs = resolved ? [resolved.entry, ...args] : args
    if (resolved) log.info(`Resolved shim: ${actualBin} ${resolved.entry}`)
    spawnWindowsHidden(actualBin, actualArgs, env)
    return undefined // PID not needed; cleanup via killPort
  }

  const child = spawn(bin, args, {
    env: env as NodeJS.ProcessEnv,
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  })
  child.unref()
  const pid = child.pid
  if (pid) gatewayChildPids.push(pid)
  log.info(`Gateway spawned hidden: ${bin} ${args.join(' ')} (PID: ${pid})`)
  return pid
}

/** Kill any gateway processes we spawned. Called on app shutdown. */
export function killGatewayChildren(): void {
  for (const pid of gatewayChildPids) {
    try {
      process.kill(pid)
      log.info(`Killed gateway child PID ${pid}`)
    } catch {}
  }
  gatewayChildPids.length = 0
}

// ── Port / process utilities ───────────────────────────────────────────────

export async function isPortListening(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
    return true
  } catch {
    return false
  }
}

export async function killPort(port: number): Promise<void> {
  try {
    if (plat === 'win32') {
      const { stdout } = await execAsync(
        `netstat -ano | findstr ":${port} " | findstr "LISTENING"`,
        { shell: CMD_EXE, timeout: 5000 }
      )
      const pid = stdout.trim().split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid) && pid !== '0') {
        await execAsync(`taskkill /F /PID ${pid}`, { shell: CMD_EXE, timeout: 5000 })
        log.info(`Killed PID ${pid} on port ${port}`)
      }
    } else {
      // Use -sTCP:LISTEN to only kill the process LISTENING on the port,
      // not processes with client connections to it (which could include ourselves).
      await execAsync(`lsof -ti:${port} -sTCP:LISTEN | xargs kill -9 2>/dev/null; true`, { shell: '/bin/sh', timeout: 5000 })
      log.info(`Kill port ${port}: done`)
    }
    await new Promise(r => setTimeout(r, 1000))
  } catch (e: any) {
    log.warn(`killPort(${port}): ${e.message}`)
  }
}

// ── Service status ─────────────────────────────────────────────────────────

/**
 * Parse `openclaw gateway status` output to determine if the service is registered/running.
 * macOS: "(loaded)"  |  Linux: "(enabled)"  |  Windows: "(registered)"
 */
export function isGatewayServiceLoaded(statusOut: string): boolean {
  if (plat === 'darwin') return statusOut.includes('(loaded)') && !statusOut.includes('(not loaded)')
  if (plat === 'linux')  return statusOut.includes('(enabled)') && !statusOut.includes('(disabled)')
  if (plat === 'win32')  return statusOut.includes('(registered)') && !statusOut.includes('(missing)')
  return statusOut.includes('(loaded)') || statusOut.includes('(enabled)') || statusOut.includes('(registered)')
}

async function isGatewayLaunchAgentLoadedMacOS(): Promise<boolean> {
  if (plat !== 'darwin') return false
  const uid = process.getuid?.() ?? 501
  try {
    await execAsync(
      `launchctl print "gui/${uid}/ai.openclaw.gateway"`,
      { shell: '/bin/zsh', timeout: 10000 },
    )
    return true
  } catch {
    return false
  }
}

async function stopSystemGatewayServiceForPortableMode(): Promise<void> {
  if (plat === 'darwin') {
    const loaded = await isGatewayLaunchAgentLoadedMacOS()
    if (!loaded) return

    const uid = process.getuid?.() ?? 501
    try {
      await execAsync(
        `launchctl bootout "gui/${uid}/ai.openclaw.gateway"`,
        { shell: '/bin/zsh', timeout: 20000 },
      )
      log.info('Portable mode: unloaded legacy launchd gateway service')
    } catch (e: any) {
      log.warn(`Portable mode: failed to unload launchd gateway service: ${e.message}`)
    }
    return
  }

  if (plat === 'linux') {
    if (!existsSync(GATEWAY_SYSTEMD_UNIT)) return
    try {
      await execAsync(
        'systemctl --user stop openclaw-gateway.service',
        { shell: process.env.SHELL || '/bin/bash', timeout: 20000 },
      )
      log.info('Portable mode: stopped legacy systemd gateway service')
    } catch (e: any) {
      log.warn(`Portable mode: failed to stop systemd gateway service: ${e.message}`)
    }
    return
  }

  if (plat === 'win32') {
    try {
      await execAsync(
        'schtasks /End /TN "OpenClaw Gateway"',
        { shell: CMD_EXE, timeout: 10000 },
      )
      log.info('Portable mode: ended legacy Scheduled Task gateway service')
    } catch (e: any) {
      log.info(`Portable mode: no running Scheduled Task gateway service to stop (${e.message})`)
    }
  }
}

// ── Token sync helpers ─────────────────────────────────────────────────────

/**
 * Extract OPENCLAW_GATEWAY_TOKEN from the platform-specific service descriptor file.
 */
export function extractTokenFromServiceFile(): string | undefined {
  if (plat === 'darwin') {
    if (!existsSync(GATEWAY_PLIST)) return undefined
    try {
      const content = readFileSync(GATEWAY_PLIST, 'utf-8')
      const m = content.match(/OPENCLAW_GATEWAY_TOKEN<\/key>\s*<string>([^<]{8,})<\/string>/i)
      return m?.[1]?.trim()
    } catch { return undefined }
  }

  if (plat === 'linux') {
    if (!existsSync(GATEWAY_SYSTEMD_UNIT)) return undefined
    try {
      const content = readFileSync(GATEWAY_SYSTEMD_UNIT, 'utf-8')
      const m = content.match(/^Environment="?OPENCLAW_GATEWAY_TOKEN=([^"\r\n]+)/m)
      return m?.[1]?.trim()
    } catch { return undefined }
  }

  if (plat === 'win32') {
    if (!existsSync(GATEWAY_TASK_SCRIPT)) return undefined
    try {
      const content = readFileSync(GATEWAY_TASK_SCRIPT, 'utf-8')
      const m = content.match(/^set\s+"?OPENCLAW_GATEWAY_TOKEN=([^"\r\n]+)/mi)
      return m?.[1]?.trim().replace(/"+$/, '')
    } catch { return undefined }
  }

  return undefined
}

/**
 * Ensure openclaw.json has gateway.mode set (defaults to 'local').
 */
export function ensureGatewayMode(): void {
  try {
    const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    const cfg = JSON.parse(raw)
    if (!cfg.gateway) cfg.gateway = {}
    if (!cfg.gateway.mode) {
      cfg.gateway.mode = 'local'
      if (!cfg.gateway.port) cfg.gateway.port = GATEWAY_PORT
      if (!cfg.gateway.bind) cfg.gateway.bind = 'loopback'
      writeFileSync(OPENCLAW_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8')
      log.info('Set gateway.mode=local in openclaw.json')
    }
  } catch (e: any) {
    log.warn(`ensureGatewayMode: ${e.message}`)
  }
}

/**
 * Remove gateway.auth.token from openclaw.json.
 */
export function clearGatewayAuthToken(): void {
  try {
    const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    const cfg = JSON.parse(raw)
    if (cfg.gateway?.auth?.token) {
      delete cfg.gateway.auth.token
      writeFileSync(OPENCLAW_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8')
      log.info('Cleared gateway.auth.token (gateway will use service env token)')
    }
  } catch (e: any) {
    log.warn(`clearGatewayAuthToken: ${e.message}`)
  }
}

/**
 * Read token from service file and write it to openclaw.json + ClawBox config.
 */
export function syncTokenFromServiceFile(): void {
  const token = extractTokenFromServiceFile()
  if (!token) {
    log.info('Service file token not found — skipping token sync')
    return
  }
  try {
    log.info(`Service token: ${token.slice(0, 4)}...${token.slice(-4)}`)
    const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    const cfg = JSON.parse(raw)
    if (!cfg.gateway) cfg.gateway = {}
    if (!cfg.gateway.auth) cfg.gateway.auth = {}
    cfg.gateway.auth.mode = 'token'
    cfg.gateway.auth.token = token
    writeFileSync(OPENCLAW_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8')
    log.info('openclaw.json token updated from service file')
  } catch (e: any) {
    log.warn(`syncTokenFromServiceFile: ${e.message}`)
  }
}

/**
 * Read openclaw.json and log the gateway URL that ClawBox will resolve from disk.
 */
export function syncGatewayUrl(): void {
  try {
    const raw = readFileSync(OPENCLAW_CONFIG, 'utf-8')
    const cfg = JSON.parse(raw)
    const port: number = cfg.gateway?.port || GATEWAY_PORT
    const token: string | undefined =
      cfg.gateway?.auth?.mode === 'token' ? cfg.gateway?.auth?.token : undefined
    const url = token
      ? `http://127.0.0.1:${port}/v1?token=${token}`
      : `http://127.0.0.1:${port}/v1`
    log.info(`Gateway URL resolved from OpenClaw config: ${url.replace(/token=[^&]+/, 'token=***')}`)
  } catch (e: any) {
    log.warn(`syncGatewayUrl: ${e.message}`)
  }
}

// ── Platform-specific gateway restart ─────────────────────────────────────

async function restartGatewayMacOS(isLoaded: boolean): Promise<void> {
  const actuallyLoaded = isLoaded || await isGatewayLaunchAgentLoadedMacOS()

  if (actuallyLoaded) {
    syncTokenFromServiceFile()
    const uid = process.getuid?.() ?? 501
    try {
      const { stdout } = await execAsync(
        `launchctl kickstart -k "gui/${uid}/ai.openclaw.gateway"`,
        { shell: '/bin/zsh', timeout: 20000 }
      )
      log.info(`launchctl kickstart: ${stdout.slice(0, 200)}`)
    } catch (e: any) {
      log.warn(`launchctl kickstart failed: ${e.message}, trying gateway restart`)
      try {
        await runOpenclawCmd('gateway restart', 30000, 'system')
      } catch (e2: any) {
        log.warn(`gateway restart fallback also failed: ${e2.message}`)
      }
    }
  } else {
    await killPort(GATEWAY_PORT)
    if (existsSync(GATEWAY_PLIST)) {
      syncTokenFromServiceFile()
      try {
        const { stdout } = await execAsync(
          `launchctl bootstrap gui/$(id -u) "${GATEWAY_PLIST}"`,
          { shell: '/bin/zsh', timeout: 20000 }
        )
        log.info(`launchctl bootstrap: ${stdout.slice(0, 200)}`)
      } catch (e: any) {
        const detail = String(e.message || '')
        log.warn(`launchctl bootstrap failed: ${detail}`)

        if (await isGatewayLaunchAgentLoadedMacOS()) {
          const uid = process.getuid?.() ?? 501
          const { stdout } = await execAsync(
            `launchctl kickstart -k "gui/${uid}/ai.openclaw.gateway"`,
            { shell: '/bin/zsh', timeout: 20000 }
          )
          log.info(`launchctl kickstart after bootstrap fallback: ${stdout.slice(0, 200)}`)
        } else {
          throw e
        }
      }
    } else {
      clearGatewayAuthToken()
      const { stdout } = await runOpenclawCmd('gateway install', 30000, 'system')
      log.info(`gateway install: ${stdout.slice(0, 200)}`)
      syncTokenFromServiceFile()
    }
  }
}

async function restartGatewayLinux(isLoaded: boolean): Promise<void> {
  const shell = process.env.SHELL || '/bin/bash'
  if (isLoaded) {
    syncTokenFromServiceFile()
    await execAsync(
      'systemctl --user daemon-reload && systemctl --user restart openclaw-gateway.service',
      { shell, timeout: 30000 }
    )
    log.info('systemd service restarted')
  } else {
    await killPort(GATEWAY_PORT)
    if (existsSync(GATEWAY_SYSTEMD_UNIT)) {
      syncTokenFromServiceFile()
      await execAsync(
        'systemctl --user daemon-reload && systemctl --user enable --now openclaw-gateway.service',
        { shell, timeout: 30000 }
      )
      log.info('systemd service enabled and started')
    } else {
      clearGatewayAuthToken()
      const { stdout } = await runOpenclawCmd('gateway install', 30000, 'system')
      log.info(`gateway install: ${stdout.slice(0, 200)}`)
      syncTokenFromServiceFile()
    }
  }
}

async function restartGatewayWindows(isLoaded: boolean, mode: OpenclawResolveMode): Promise<void> {
  if (mode === 'portable') {
    await killPort(GATEWAY_PORT)
    clearGatewayAuthToken()
    const bin = await findOpenclawBin('portable')
    if (!existsSync(bin)) {
      throw new Error('Portable openclaw binary not found')
    }
    const binDir = dirname(bin)
    const env = { ...process.env, PATH: `${binDir};${process.env.PATH || ''}`, HOME: homedir() }
    spawnGatewayHidden(bin, ['gateway'], env as any)
    syncTokenFromServiceFile()
    return
  }

  const taskName = 'OpenClaw Gateway'
  if (isLoaded) {
    syncTokenFromServiceFile()
    try {
      await execAsync(`schtasks /End /TN "${taskName}"`, { shell: CMD_EXE, timeout: 10000 })
    } catch {} // ok if not running
    await new Promise(r => setTimeout(r, 1000))
    try {
      await execAsync(`schtasks /Run /TN "${taskName}"`, { shell: CMD_EXE, timeout: 20000 })
      log.info('Scheduled Task restarted')
      return
    } catch (e: any) {
      log.warn(`schtasks /Run failed: ${e.message}, falling back to direct start`)
    }
  }

  await killPort(GATEWAY_PORT)
  clearGatewayAuthToken()

  try {
    const { stdout } = await runOpenclawCmd('gateway install --allow-unconfigured', 30000, 'system')
    log.info(`gateway install: ${stdout.slice(0, 200)}`)
  } catch (e: any) {
    log.warn(`gateway install failed (${e.message}), starting gateway directly`)
    const bin = await findOpenclawBin('system')
    spawnGatewayHidden(bin, ['gateway'], { ...process.env, HOME: homedir() } as any)
  }
  syncTokenFromServiceFile()
}

/**
 * Restart (or install) the openclaw gateway, sync the auth token, return success flag.
 *
 * When openclaw is installed in the portable Node.js runtime, launchd/systemd services
 * won't work (the plist/unit shebang can't find `node` without the portable PATH).
 * In that case, spawn the gateway directly as a detached child process.
 */
export async function restartGateway(mode?: OpenclawResolveMode): Promise<boolean> {
  const resolvedMode = resolveOpenclawMode(mode)
  const bin = await findOpenclawBin(resolvedMode)
  const portableLaunch = (resolvedMode === 'portable' || isPortableBin(bin))
    ? resolvePortableOpenclawLaunch(bin)
    : null

  if (resolvedMode === 'portable' && !portableLaunch && !existsSync(bin)) {
    log.warn('restartGateway: portable mode selected but portable openclaw not found')
    return false
  }

  // Portable Node path: skip service registration, spawn directly
  if (resolvedMode === 'portable' || isPortableBin(bin)) {
    if (!portableLaunch) {
      log.warn(`restartGateway: portable openclaw launch target not resolved from ${bin}`)
      return false
    }
    log.info(`Portable openclaw detected at ${bin}, spawning gateway directly via ${portableLaunch.nodeBin}`)
    await stopSystemGatewayServiceForPortableMode()
    if (await isPortListening(GATEWAY_PORT)) {
      await killPort(GATEWAY_PORT)
    }
    ensureGatewayMode()
    clearGatewayAuthToken()
    const binDir = dirname(portableLaunch.nodeBin)
    const sep = plat === 'win32' ? ';' : ':'
    const env = { ...process.env, PATH: `${binDir}${sep}${process.env.PATH || ''}`, HOME: homedir() }
    spawnGatewayHidden(portableLaunch.nodeBin, [portableLaunch.entryPath, 'gateway'], env as any)
    syncGatewayUrl()
    return true
  }

  // System openclaw: use platform service managers (launchd/systemd/schtasks)
  let statusOut = ''
  try {
    const { stdout } = await runOpenclawCmd('gateway status', 10000, resolvedMode)
    statusOut = stdout
    log.info(`Gateway status: ${statusOut.slice(0, 400)}`)
  } catch (e: any) {
    log.warn(`Gateway status check failed: ${e.message}`)
  }

  const isLoaded = isGatewayServiceLoaded(statusOut)
  log.info(`Gateway service loaded: ${isLoaded}`)

  if (plat === 'darwin') {
    await restartGatewayMacOS(isLoaded)
  } else if (plat === 'linux') {
    await restartGatewayLinux(isLoaded)
  } else if (plat === 'win32') {
    await restartGatewayWindows(isLoaded, resolvedMode)
  } else {
    await killPort(GATEWAY_PORT)
    clearGatewayAuthToken()
    const { stdout } = await runOpenclawCmd('gateway install', 30000, resolvedMode)
    log.info(`gateway install (generic): ${stdout.slice(0, 200)}`)
    syncTokenFromServiceFile()
  }
  return true
}

// ── Auto-start gateway ────────────────────────────────────────────────────

export async function ensureGatewayWindows(mode?: OpenclawResolveMode): Promise<boolean> {
  const resolvedMode = resolveOpenclawMode(mode)

  if (resolvedMode === 'portable') {
    log.info('ensureGatewayWindows: delegating portable startup to restartGateway()')
    return restartGateway('portable')
  }

  let bin = await findOpenclawBin(resolvedMode)
  log.info(`ensureGatewayWindows(${resolvedMode}): findOpenclawBin resolved to: ${bin}`)

  if (bin === 'openclaw' || bin === 'openclaw.cmd') {
    const nvmSym = process.env.NVM_SYMLINK || 'C:\\nvm4w\\nodejs'
    const nvmCandidate = join(nvmSym, 'openclaw.cmd')
    if (existsSync(nvmCandidate)) {
      bin = nvmCandidate
      log.info(`ensureGatewayWindows: found at nvm symlink: ${bin}`)
    } else {
      log.warn('openclaw binary not found - cannot start gateway')
      return false
    }
  }

  log.info(`Starting gateway hidden via: ${bin}`)
  const env = getWindowsNvmEnv()
  spawnGatewayHidden(bin, ['gateway'], env as any)
  return true
}

export async function waitForGatewayPort(): Promise<boolean> {
  const maxAttempts = plat === 'win32' ? 200 : 40
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 1500))
    if (await isPortListening(GATEWAY_PORT)) {
      log.info('Gateway is now listening')
      syncGatewayUrl()
      return true
    }
  }
  log.warn('Gateway did not start within timeout — will retry when onboard runs')
  return false
}

/**
 * Ensure the openclaw gateway is running. Called once at server startup.
 */
export async function ensureGateway(): Promise<void> {
  if (!existsSync(OPENCLAW_CONFIG)) {
    log.warn('openclaw.json not found — skipping gateway auto-start (onboard not completed)')
    return
  }

  ensureGatewayMode()
  const resolvedMode = resolveOpenclawMode()
  const shouldSupervisePortable = resolvedMode === 'portable'

  if (shouldSupervisePortable) {
    await stopSystemGatewayServiceForPortableMode()
  }

  const alreadyListening = await isPortListening(GATEWAY_PORT)
  if (alreadyListening && !shouldSupervisePortable) {
    log.info(`Gateway already listening on port ${GATEWAY_PORT}`)
    syncGatewayUrl()
    return
  }

  if (alreadyListening && shouldSupervisePortable) {
    log.info(`Portable mode detected with an existing listener on port ${GATEWAY_PORT}; restarting under ClawBox supervision...`)
  } else {
    log.info(`Gateway not listening on port ${GATEWAY_PORT}, attempting to start...`)
  }

  try {
    let started = false

    if (plat === 'win32') {
      started = await ensureGatewayWindows(resolvedMode)
    } else {
      log.info(`ensureGateway: delegating auto-start to restartGateway(${resolvedMode})`)
      started = await restartGateway(resolvedMode)
    }

    if (!started) {
      log.warn(`ensureGateway: startup skipped because no runnable OpenClaw target was resolved (mode=${resolvedMode})`)
      return
    }
  } catch (e: any) {
    log.warn(`ensureGateway start failed: ${e.message}`)
    return
  }

  const ready = await waitForGatewayPort()
  if (!ready) {
    log.warn(`ensureGateway: gateway still not ready after auto-start attempt (mode=${resolvedMode})`)
  }
}
