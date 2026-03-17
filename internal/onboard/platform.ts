import { join } from 'path'

export const plat = process.platform as string

export const CMD_EXE = process.env.ComSpec || join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')

export function getNodePlatformArch(): string {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'win32' && arch === 'x64') return 'win-x64'
  if (platform === 'win32' && arch === 'arm64') return 'win-arm64'
  if (platform === 'linux' && arch === 'x64') return 'linux-x64'
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64'
  return `${platform}-${arch}`
}

export function getNodeArchiveName(version: string): string {
  const platformArch = getNodePlatformArch()
  const ext = platformArch.startsWith('win-') ? 'zip' : 'tar.gz'
  return `node-v${version}-${platformArch}.${ext}`
}
