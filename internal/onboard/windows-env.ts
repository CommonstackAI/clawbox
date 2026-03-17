import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { plat, CMD_EXE } from './platform'
import { execAsync, log } from './utils'

function mergeWindowsPath(parts: Array<string | undefined>): string {
  const merged: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    for (const seg of part.split(';')) {
      const s = seg.trim()
      if (!s) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(s)
    }
  }
  return merged.join(';')
}

export function getWindowsNvmEnv(): Record<string, string> {
  const env: Record<string, string | undefined> = { ...process.env, HOME: homedir() }
  if (!env.NVM_HOME) env.NVM_HOME = join(homedir(), 'AppData', 'Local', 'nvm')
  if (!env.NVM_SYMLINK) env.NVM_SYMLINK = 'C:\\nvm4w\\nodejs'
  const nvmHome = env.NVM_HOME!
  const nvmSym = env.NVM_SYMLINK!
  const appDataNpm = join(env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'npm')
  const extraPaths = [nvmSym, nvmHome, appDataNpm]

  // NVM_SYMLINK junction may not exist (nvm use can fail without admin on some setups).
  // Fall back to the actual node install directory inside NVM_HOME.
  if (!existsSync(join(nvmSym, 'node.exe'))) {
    try {
      const nodeDir = readdirSync(nvmHome)
        .filter(d => d.startsWith('v') && existsSync(join(nvmHome, d, 'node.exe')))
        .sort((a, b) => {
          const va = a.slice(1).split('.').map(Number)
          const vb = b.slice(1).split('.').map(Number)
          for (let i = 0; i < 3; i++) if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0)
          return 0
        })
      if (nodeDir.length > 0) {
        extraPaths.unshift(join(nvmHome, nodeDir[0]))
      }
    } catch {}
  }

  if (env.npm_config_prefix) extraPaths.push(env.npm_config_prefix)

  // Common system Node.js install directories (non-nvm setups).
  const pf = env.ProgramFiles || 'C:\\Program Files'
  const pfx86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const localAppData = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const systemNodePaths = [
    join(pf, 'nodejs'),
    join(pfx86, 'nodejs'),
    join(localAppData, 'Programs', 'nodejs'),
  ]
  for (const p of systemNodePaths) {
    if (existsSync(join(p, 'node.exe'))) extraPaths.push(p)
  }

  const gitPath = join(env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd')
  if (existsSync(gitPath)) extraPaths.push(gitPath)

  env.PATH = mergeWindowsPath([extraPaths.filter(Boolean).join(';'), env.PATH || ''])
  return env as Record<string, string>
}

/**
 * Windows: after installing nvm-windows, refresh PATH and NVM vars from registry
 * so the current process can find nvm/node without restarting.
 *
 * Registry PATH values are REG_EXPAND_SZ and contain unexpanded %VAR% references.
 * We read NVM_HOME / NVM_SYMLINK first, then expand %VAR% references in PATH ourselves.
 */
export async function refreshWindowsPath(): Promise<void> {
  if (plat !== 'win32') return

  const readRegValue = async (key: string, name: string): Promise<string | undefined> => {
    try {
      const { stdout } = await execAsync(
        `reg query "${key}" /v ${name}`,
        { shell: CMD_EXE, timeout: 5000 },
      )
      const m = stdout.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.+)`, 'i'))
      return m?.[1]?.trim()
    } catch { return undefined }
  }

  try {
    // 1. Read NVM vars first so we can expand %NVM_HOME% etc. in PATH
    const nvmHome = await readRegValue('HKCU\\Environment', 'NVM_HOME')
    const nvmSym = await readRegValue('HKCU\\Environment', 'NVM_SYMLINK')
    if (nvmHome) process.env.NVM_HOME = nvmHome
    if (nvmSym) process.env.NVM_SYMLINK = nvmSym

    // 2. Read raw PATH values from registry
    const userPath = await readRegValue('HKCU\\Environment', 'Path') || ''
    const sysPath = await readRegValue(
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'Path',
    ) || ''
    let combined = `${userPath};${sysPath}`

    // 3. Expand %VAR% references using current process.env
    combined = combined.replace(/%([^%]+)%/g, (_, varName) => process.env[varName] || '')

    // 4. Ensure NVM dirs are at the front of PATH
    const front = [nvmSym, nvmHome].filter(Boolean).join(';')
    process.env.PATH = mergeWindowsPath([front, combined, process.env.PATH || ''])

    log.info(`refreshWindowsPath: NVM_HOME=${nvmHome}, NVM_SYMLINK=${nvmSym}, PATH starts with ${process.env.PATH?.slice(0, 120)}`)
  } catch (e: any) {
    log.warn(`refreshWindowsPath: ${e.message}`)
  }
}

/**
 * Execute a command with nvm environment sourced (macOS/Linux).
 * On Windows, just run via cmd.exe directly.
 */
export async function execWithNvm(cmd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  if (plat === 'win32') {
    return execAsync(cmd, { shell: CMD_EXE, timeout: timeoutMs, env: getWindowsNvmEnv() })
  }
  const loginShell = plat === 'darwin' ? '/bin/zsh' : (process.env.SHELL || '/bin/bash')
  const wrapped = `source ~/.nvm/nvm.sh 2>/dev/null; ${cmd}`
  return execAsync(wrapped, { shell: loginShell, timeout: timeoutMs, env: { ...process.env, HOME: homedir() } })
}

export async function checkNvmInstalled(): Promise<{ installed: boolean; version?: string }> {
  try {
    if (plat === 'win32') {
      const env = getWindowsNvmEnv()
      const nvmExe = join(env.NVM_HOME!, 'nvm.exe')
      const cmd = existsSync(nvmExe) ? `"${nvmExe}" version` : 'nvm version'
      const { stdout } = await execAsync(cmd, { shell: CMD_EXE, timeout: 5000, env })
      const ver = stdout.trim()
      if (ver && ver !== '0.0.0') return { installed: true, version: ver }
      return { installed: false }
    }
    const { stdout } = await execWithNvm('nvm --version', 5000)
    const ver = stdout.trim()
    return ver ? { installed: true, version: ver } : { installed: false }
  } catch {
    return { installed: false }
  }
}

export async function checkNodeInstalled(): Promise<{ installed: boolean; version?: string }> {
  try {
    const { stdout } = await execWithNvm('node --version', 5000)
    const ver = stdout.trim()
    if (ver && /^v24\./.test(ver)) return { installed: true, version: ver }
    return { installed: false, version: ver || undefined }
  } catch {}

  // Windows: symlink might be broken — try `nvm use` to fix it
  if (plat === 'win32') {
    try {
      const env = getWindowsNvmEnv()
      const nvmExe = join(env.NVM_HOME!, 'nvm.exe')
      if (existsSync(nvmExe)) {
        const { stdout: listOut } = await execAsync(`"${nvmExe}" list`, { shell: CMD_EXE, timeout: 5000, env })
        const v24match = listOut.match(/(\d+\.\d+\.\d+)/g)?.find(v => v.startsWith('24.'))
        if (v24match) {
          log.info(`Node ${v24match} installed but symlink broken, running nvm use...`)
          await execAsync(`"${nvmExe}" use ${v24match}`, { shell: CMD_EXE, timeout: 15000, env })
          await refreshWindowsPath()
          const { stdout } = await execWithNvm('node --version', 5000)
          const ver = stdout.trim()
          if (ver && /^v24\./.test(ver)) return { installed: true, version: ver }
        }
      }
    } catch (e: any) {
      log.warn(`checkNodeInstalled nvm use fallback: ${e.message}`)
    }

    // Last resort: nvm use may have failed to create the symlink (needs admin on some setups).
    // Run node.exe directly from the NVM_HOME install directory.
    try {
      const nvmHome = process.env.NVM_HOME || join(homedir(), 'AppData', 'Local', 'nvm')
      const v24dirs = readdirSync(nvmHome)
        .filter(d => d.startsWith('v24.') && existsSync(join(nvmHome, d, 'node.exe')))
      if (v24dirs.length > 0) {
        const nodeDir = join(nvmHome, v24dirs[0])
        const nodeExe = join(nodeDir, 'node.exe')
        const { stdout } = await execAsync(`"${nodeExe}" --version`, { shell: CMD_EXE, timeout: 5000 })
        const ver = stdout.trim()
        if (ver && /^v24\./.test(ver)) {
          log.info(`Found node ${ver} directly at ${nodeDir}, adding to PATH`)
          process.env.PATH = `${nodeDir};${process.env.PATH || ''}`
          return { installed: true, version: ver }
        }
      }
    } catch (e: any) {
      log.warn(`checkNodeInstalled direct-exe fallback: ${e.message}`)
    }
  }

  return { installed: false }
}
