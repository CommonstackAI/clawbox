import { exec, type ExecOptions } from 'child_process'
import { promisify } from 'util'
import { createLogger } from '../logger'

export const log = createLogger('Onboard')

/**
 * Compare two semver-like version strings (e.g. "2026.3.12").
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

const _execAsync = promisify(exec)

/** exec wrapper that sets windowsHide to prevent cmd.exe popups on Windows */
export function execAsync(cmd: string, opts?: ExecOptions): Promise<{ stdout: string; stderr: string }> {
  return _execAsync(cmd, { ...opts, windowsHide: true } as any) as any
}
