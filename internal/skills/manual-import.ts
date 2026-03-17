import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { tmpdir } from 'node:os'
import { basename, join, normalize, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import extract from 'extract-zip'

const execFileAsync = promisify(execFile)
const TEMP_PREFIX = 'clawbox-skill-import-'
const MAX_DISCOVERY_DEPTH = 4
const MAX_DISCOVERY_DIRS = 400
const SKIP_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  '.idea',
  '.vscode',
  '__pycache__',
  '.venv',
  'venv',
])

export type ManualSkillImportSource = 'directory' | 'archive' | 'url'

export class ManualSkillImportError extends Error {
  code:
    | 'workspace_not_configured'
    | 'source_not_found'
    | 'invalid_path'
    | 'unsupported_archive'
    | 'invalid_url'
    | 'download_failed'
    | 'missing_skill'
    | 'ambiguous_skill'
    | 'skill_exists'

  constructor(
    message: string,
    code: ManualSkillImportError['code'],
  ) {
    super(message)
    this.name = 'ManualSkillImportError'
    this.code = code
  }
}

function normalizeArchiveType(filePath: string): 'zip' | 'tar.gz' | null {
  const lower = filePath.trim().toLowerCase()
  if (lower.endsWith('.zip') || lower.endsWith('.skill')) {
    return 'zip'
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tar.gz'
  }
  return null
}

function expandLocalPath(rawValue: string): string {
  if (rawValue === '~') {
    return homedir()
  }
  if (rawValue.startsWith('~/')) {
    return join(homedir(), rawValue.slice(2))
  }
  return rawValue
}

function ensureHttpUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new ManualSkillImportError('Invalid remote URL', 'invalid_url')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new ManualSkillImportError('Only http(s) URLs are supported', 'invalid_url')
  }
  return parsed
}

function sanitizeImportedDirName(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!value) {
    throw new ManualSkillImportError('Could not derive a safe skill directory name', 'missing_skill')
  }
  return value
}

function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false)
}

async function ensureWorkspaceSkillsDir(workspaceDir: string): Promise<string> {
  const normalized = workspaceDir.trim()
  if (!normalized) {
    throw new ManualSkillImportError('Workspace directory is not configured', 'workspace_not_configured')
  }

  const skillsDir = resolve(normalized, 'skills')
  await fs.mkdir(skillsDir, { recursive: true })
  return skillsDir
}

async function resolveLocalSourcePath(rawValue: string): Promise<string> {
  const trimmed = rawValue.trim()
  if (!trimmed) {
    throw new ManualSkillImportError('Local path is required', 'invalid_path')
  }

  const resolved = resolve(expandLocalPath(trimmed))
  if (!await pathExists(resolved)) {
    throw new ManualSkillImportError('Local path was not found', 'source_not_found')
  }
  return resolved
}

async function safeRemove(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true }).catch(() => undefined)
}

async function extractZipArchive(params: { archivePath: string; destDir: string }): Promise<void> {
  await extract(params.archivePath, { dir: resolve(params.destDir) })
}

function isSafeTarEntry(entry: string): boolean {
  const normalized = entry.replace(/\\/g, '/').trim()
  if (!normalized) return true
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

async function extractTarArchive(params: { archivePath: string; destDir: string }): Promise<void> {
  const { stdout } = await execFileAsync('tar', ['-tzf', params.archivePath], {
    maxBuffer: 1024 * 1024 * 8,
  })
  const entries = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (entries.some((entry) => !isSafeTarEntry(entry))) {
    throw new ManualSkillImportError('Archive contains unsafe paths', 'unsupported_archive')
  }

  await execFileAsync('tar', ['-xzf', params.archivePath, '-C', params.destDir], {
    maxBuffer: 1024 * 1024 * 8,
  })
}

async function extractArchiveToTemp(params: {
  archivePath: string
  tempDir: string
}): Promise<string> {
  const archiveType = normalizeArchiveType(params.archivePath)
  if (!archiveType) {
    throw new ManualSkillImportError('Unsupported archive format', 'unsupported_archive')
  }

  const destDir = join(params.tempDir, 'extract')
  await fs.mkdir(destDir, { recursive: true })

  if (archiveType === 'zip') {
    await extractZipArchive({ archivePath: params.archivePath, destDir })
  } else {
    await extractTarArchive({ archivePath: params.archivePath, destDir })
  }

  return destDir
}

async function findSkillDirs(rootDir: string): Promise<string[]> {
  const found = new Set<string>()
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  let visited = 0

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    visited += 1
    if (visited > MAX_DISCOVERY_DIRS) break

    const skillMdPath = join(current.dir, 'SKILL.md')
    if (await pathExists(skillMdPath)) {
      found.add(current.dir)
      continue
    }

    if (current.depth >= MAX_DISCOVERY_DEPTH) {
      continue
    }

    const entries = await fs.readdir(current.dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (SKIP_DIR_NAMES.has(entry.name)) continue
      queue.push({ dir: join(current.dir, entry.name), depth: current.depth + 1 })
    }
  }

  return Array.from(found)
}

async function resolvePreferredSkillDir(rootDir: string, preferredSubpath: string): Promise<string | null> {
  const searchRoots = [rootDir]
  const topLevelEntries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => [])
  for (const entry of topLevelEntries) {
    if (!entry.isDirectory()) continue
    searchRoots.push(join(rootDir, entry.name))
  }

  for (const searchRoot of searchRoots) {
    const candidate = resolve(searchRoot, normalize(preferredSubpath))
    if (relative(searchRoot, candidate).startsWith('..')) {
      continue
    }

    if (!await pathExists(candidate)) {
      continue
    }

    const directSkill = join(candidate, 'SKILL.md')
    if (await pathExists(directSkill)) {
      return candidate
    }

    const nested = await findSkillDirs(candidate)
    if (nested.length === 1) return nested[0]
    if (nested.length > 1) {
      throw new ManualSkillImportError('Multiple skills were found in the imported source', 'ambiguous_skill')
    }
  }

  return null
}

async function resolveImportedSkillDir(rootDir: string, preferredSubpath?: string): Promise<string> {
  if (preferredSubpath) {
    const candidate = resolve(rootDir, normalize(preferredSubpath))
    if (relative(rootDir, candidate).startsWith('..')) {
      throw new ManualSkillImportError('Preferred skill path escapes the extracted archive', 'invalid_path')
    }

    const preferredSkillDir = await resolvePreferredSkillDir(rootDir, preferredSubpath)
    if (preferredSkillDir) {
      return preferredSkillDir
    }
  }

  const matches = await findSkillDirs(rootDir)
  if (matches.length === 0) {
    throw new ManualSkillImportError('No SKILL.md was found in the imported source', 'missing_skill')
  }
  if (matches.length > 1) {
    throw new ManualSkillImportError('Multiple skills were found in the imported source', 'ambiguous_skill')
  }
  return matches[0]
}

async function readSkillDirectoryName(skillDir: string): Promise<string> {
  const skillMdPath = join(skillDir, 'SKILL.md')
  const raw = await fs.readFile(skillMdPath, 'utf8').catch(() => '')
  const frontmatterMatch = raw.match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatterMatch?.[1]) {
    const nameLine = frontmatterMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('name:'))

    if (nameLine) {
      const [, ...rest] = nameLine.split(':')
      const value = rest.join(':').trim().replace(/^['"]|['"]$/g, '')
      if (value) {
        return sanitizeImportedDirName(value)
      }
    }
  }

  return sanitizeImportedDirName(basename(skillDir))
}

async function copyImportedSkill(params: {
  skillDir: string
  workspaceDir: string
  overwrite?: boolean
}): Promise<{ skillName: string; importedPath: string }> {
  const skillsDir = await ensureWorkspaceSkillsDir(params.workspaceDir)
  const skillName = await readSkillDirectoryName(params.skillDir)
  const targetDir = join(skillsDir, skillName)

  if (await pathExists(targetDir)) {
    if (!params.overwrite) {
      throw new ManualSkillImportError('A skill with the same name already exists', 'skill_exists')
    }
    await safeRemove(targetDir)
  }

  await fs.cp(params.skillDir, targetDir, {
    recursive: true,
    preserveTimestamps: true,
    errorOnExist: true,
    force: false,
  })

  return {
    skillName,
    importedPath: targetDir,
  }
}

async function resolveGitHubArchive(input: URL): Promise<{
  archiveUrl: string
  archiveType: 'zip'
  preferredSubpath?: string
} | null> {
  if (input.hostname !== 'github.com') {
    return null
  }

  const segments = input.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    return null
  }

  const owner = segments[0]
  const repo = segments[1].replace(/\.git$/i, '')
  if (!owner || !repo) {
    return null
  }

  let branch: string | null = null
  let preferredSubpath: string | undefined
  if (segments[2] === 'tree' && segments[3]) {
    branch = segments[3]
    preferredSubpath = segments.slice(4).join('/')
  }

  if (!branch) {
    const repoApiUrl = `https://api.github.com/repos/${owner}/${repo}`
    try {
      const res = await fetch(repoApiUrl, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'ClawBox/1.0',
        },
      })
      if (res.ok) {
        const data = await res.json() as { default_branch?: string }
        branch = data.default_branch?.trim() || null
      }
    } catch {
      branch = null
    }
  }

  const branchCandidates = branch ? [branch] : ['main', 'master']
  for (const candidate of branchCandidates) {
    const archiveUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(candidate)}`
    try {
      const head = await fetch(archiveUrl, {
        method: 'HEAD',
        headers: { 'User-Agent': 'ClawBox/1.0' },
      })
      if (head.ok) {
        return { archiveUrl, archiveType: 'zip', preferredSubpath }
      }
    } catch {
      // ignore and continue fallback probing
    }
  }

  return {
    archiveUrl: `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branchCandidates[0])}`,
    archiveType: 'zip',
    preferredSubpath,
  }
}

async function downloadRemoteArchive(params: {
  url: string
  tempDir: string
}): Promise<{ archivePath: string; preferredSubpath?: string }> {
  const parsed = ensureHttpUrl(params.url)
  const githubArchive = await resolveGitHubArchive(parsed)
  const archiveUrl = githubArchive?.archiveUrl ?? params.url
  const archiveType = githubArchive?.archiveType ?? normalizeArchiveType(parsed.pathname)
  if (!archiveType) {
    throw new ManualSkillImportError(
      'Remote import currently supports GitHub repositories or direct archive URLs',
      'invalid_url',
    )
  }

  const response = await fetch(archiveUrl, {
    headers: { 'User-Agent': 'ClawBox/1.0' },
  }).catch(() => null)

  if (!response?.ok) {
    throw new ManualSkillImportError('Failed to download the remote skill source', 'download_failed')
  }

  const fileName = archiveType === 'zip' ? 'remote-skill.zip' : 'remote-skill.tar.gz'
  const archivePath = join(params.tempDir, fileName)
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(archivePath, buffer)

  return {
    archivePath,
    preferredSubpath: githubArchive?.preferredSubpath,
  }
}

async function importFromDirectory(params: {
  value: string
  workspaceDir: string
  overwrite?: boolean
}): Promise<{ skillName: string; importedPath: string }> {
  const sourcePath = await resolveLocalSourcePath(params.value)
  const stat = await fs.stat(sourcePath).catch(() => null)
  if (!stat?.isDirectory()) {
    throw new ManualSkillImportError('The local path is not a directory', 'invalid_path')
  }

  const skillDir = await resolveImportedSkillDir(sourcePath)
  return copyImportedSkill({
    skillDir,
    workspaceDir: params.workspaceDir,
    overwrite: params.overwrite,
  })
}

async function importFromArchive(params: {
  value: string
  workspaceDir: string
  overwrite?: boolean
}): Promise<{ skillName: string; importedPath: string }> {
  const archivePath = await resolveLocalSourcePath(params.value)
  const stat = await fs.stat(archivePath).catch(() => null)
  if (!stat?.isFile()) {
    throw new ManualSkillImportError('The local path is not a file', 'invalid_path')
  }
  if (!normalizeArchiveType(archivePath)) {
    throw new ManualSkillImportError('Unsupported archive format', 'unsupported_archive')
  }

  const tempDir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX))
  try {
    const extractDir = await extractArchiveToTemp({ archivePath, tempDir })
    const skillDir = await resolveImportedSkillDir(extractDir)
    return await copyImportedSkill({
      skillDir,
      workspaceDir: params.workspaceDir,
      overwrite: params.overwrite,
    })
  } finally {
    await safeRemove(tempDir)
  }
}

async function importFromUrl(params: {
  value: string
  workspaceDir: string
  overwrite?: boolean
}): Promise<{ skillName: string; importedPath: string }> {
  const tempDir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX))
  try {
    const { archivePath, preferredSubpath } = await downloadRemoteArchive({
      url: params.value,
      tempDir,
    })
    const extractDir = await extractArchiveToTemp({ archivePath, tempDir })
    const skillDir = await resolveImportedSkillDir(extractDir, preferredSubpath)
    return await copyImportedSkill({
      skillDir,
      workspaceDir: params.workspaceDir,
      overwrite: params.overwrite,
    })
  } finally {
    await safeRemove(tempDir)
  }
}

export async function importManualSkill(params: {
  source: ManualSkillImportSource
  value: string
  workspaceDir: string
  overwrite?: boolean
}): Promise<{ ok: true; skillName: string; importedPath: string }> {
  const workspaceDir = params.workspaceDir.trim()
  const value = params.value.trim()

  let result: { skillName: string; importedPath: string }
  switch (params.source) {
    case 'directory':
      result = await importFromDirectory({
        value,
        workspaceDir,
        overwrite: params.overwrite,
      })
      break
    case 'archive':
      result = await importFromArchive({
        value,
        workspaceDir,
        overwrite: params.overwrite,
      })
      break
    case 'url':
      result = await importFromUrl({
        value,
        workspaceDir,
        overwrite: params.overwrite,
      })
      break
    default:
      throw new ManualSkillImportError('Unsupported import source', 'invalid_path')
  }

  return {
    ok: true,
    skillName: result.skillName,
    importedPath: result.importedPath,
  }
}
