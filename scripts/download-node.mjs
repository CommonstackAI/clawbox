/**
 * Prepare a bundled portable runtime archive for the current platform.
 * The output keeps the standard Node.js directory name so the existing
 * runtime extraction logic can keep using the same resource lookup path.
 *
 * Environment variables:
 *   SKIP_NODE_DOWNLOAD=1       skip runtime preparation
 *   FORCE_PORTABLE_RUNTIME=1   rebuild even if cached metadata matches
 *   OPENCLAW_NPM_REGISTRY=...  override npm registry for openclaw install
 *   OPENCLAW_PACKAGE_SPEC=...  override package spec (default: openclaw@target)
 */
import { execFileSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import archiver from 'archiver'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (process.env.SKIP_NODE_DOWNLOAD === '1') {
  console.log('SKIP_NODE_DOWNLOAD=1 - skipping portable runtime preparation')
  process.exit(0)
}

const compat = JSON.parse(readFileSync(resolve(root, 'internal/compatibility.json'), 'utf8'))
const nodeVersion = compat.node.targetVersion
const openclawVersion = compat.openclaw.targetVersion
const packageSpec = process.env.OPENCLAW_PACKAGE_SPEC || `openclaw@${openclawVersion}`

function getNodePlatformArch() {
  const p = process.platform
  const a = process.arch
  if (p === 'darwin' && a === 'arm64') return 'darwin-arm64'
  if (p === 'darwin' && a === 'x64') return 'darwin-x64'
  if (p === 'win32' && a === 'x64') return 'win-x64'
  if (p === 'win32' && a === 'arm64') return 'win-arm64'
  if (p === 'linux' && a === 'x64') return 'linux-x64'
  if (p === 'linux' && a === 'arm64') return 'linux-arm64'
  return `${p}-${a}`
}

const platformArch = getNodePlatformArch()
const isWin = platformArch.startsWith('win-')
const archiveExt = isWin ? 'zip' : 'tar.gz'
const dirName = `node-v${nodeVersion}-${platformArch}`
const archiveName = `${dirName}.${archiveExt}`

const resourcesDir = resolve(root, 'src-tauri/resources')
const runtimeOutDir = resolve(resourcesDir, 'node')
const cacheDir = resolve(resourcesDir, '.cache/portable-runtime')
const sourceCacheDir = resolve(cacheDir, 'source')
const workDir = resolve(cacheDir, 'work', platformArch)
const outPath = resolve(runtimeOutDir, archiveName)
const metaPath = resolve(cacheDir, `${archiveName}.meta.json`)
const sourceArchivePath = resolve(sourceCacheDir, archiveName)
const macNodeEntitlementsPath = resolve(cacheDir, 'mac-node-runtime.entitlements.plist')

const registries = process.env.OPENCLAW_NPM_REGISTRY
  ? [process.env.OPENCLAW_NPM_REGISTRY]
  : ['https://registry.npmjs.org', 'https://registry.npmmirror.com']

const expectedMeta = {
  nodeVersion,
  openclawVersion,
  packageSpec,
  platformArch,
}

function loadMeta() {
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
}

function resolveMacSigningIdentity() {
  if (process.platform !== 'darwin') return null
  if (process.env.APPLE_SIGNING_IDENTITY) return process.env.APPLE_SIGNING_IDENTITY
  try {
    const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const line of output.split('\n')) {
      const match = line.match(/"([^"]*Developer ID Application:[^"]+)"/)
      if (match?.[1]) return match[1]
    }
  } catch {}
  return null
}

if (process.env.FORCE_PORTABLE_RUNTIME !== '1' && existsSync(outPath)) {
  const currentMeta = loadMeta()
  if (
    currentMeta?.nodeVersion === expectedMeta.nodeVersion &&
    currentMeta?.openclawVersion === expectedMeta.openclawVersion &&
    currentMeta?.packageSpec === expectedMeta.packageSpec &&
    currentMeta?.platformArch === expectedMeta.platformArch
  ) {
    console.log(`Portable runtime already prepared: ${outPath}`)
    process.exit(0)
  }
}

mkdirSync(runtimeOutDir, { recursive: true })
mkdirSync(sourceCacheDir, { recursive: true })
mkdirSync(workDir, { recursive: true })

async function download(url, dest) {
  console.log(`Downloading: ${url}`)
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`)
  const ws = createWriteStream(dest)
  await pipeline(Readable.fromWeb(resp.body), ws)
}

async function ensureSourceArchive() {
  if (existsSync(sourceArchivePath)) {
    console.log(`Using cached Node archive: ${sourceArchivePath}`)
    return
  }

  const urls = [
    `https://nodejs.org/dist/v${nodeVersion}/${archiveName}`,
    `https://npmmirror.com/mirrors/node/v${nodeVersion}/${archiveName}`,
  ]

  let lastErr
  for (const url of urls) {
    try {
      await download(url, sourceArchivePath)
      console.log(`Downloaded source archive to ${sourceArchivePath}`)
      return
    } catch (e) {
      lastErr = e
      console.warn(`  Failed: ${e.message}`)
    }
  }

  throw new Error(`Failed to download Node.js source archive: ${lastErr?.message}`)
}

function extractArchive(archivePath, destDir) {
  if (isWin) {
    execFileSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Force -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}'`,
    ], { stdio: 'inherit' })
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' })
  }
}

async function packArchive(nodeDir, targetArchive) {
  rmSync(targetArchive, { force: true })
  if (isWin) {
    // Use archiver for Windows to handle long paths that PowerShell Compress-Archive cannot handle
    return new Promise((resolve, reject) => {
      const output = createWriteStream(targetArchive)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      archive.on('error', (err) => reject(err))

      archive.pipe(output)
      archive.directory(nodeDir, basename(nodeDir))
      archive.finalize()
    })
  }
  execFileSync('tar', ['-czf', targetArchive, '-C', dirname(nodeDir), dirName], { stdio: 'inherit' })
}

function resolveNodePaths(nodeDir) {
  const nodeBin = isWin ? join(nodeDir, 'node.exe') : join(nodeDir, 'bin', 'node')
  const npmCliCandidates = isWin
    ? [join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')]
    : [join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  const npmCli = npmCliCandidates.find((candidate) => existsSync(candidate))
  const binDir = isWin ? nodeDir : join(nodeDir, 'bin')
  if (!existsSync(nodeBin)) {
    throw new Error(`Node executable not found after extraction: ${nodeBin}`)
  }
  if (!npmCli) {
    throw new Error(`npm-cli.js not found after extraction in ${nodeDir}`)
  }
  return { nodeBin, npmCli, binDir }
}

function installOpenclaw(nodeDir) {
  const { nodeBin, npmCli, binDir } = resolveNodePaths(nodeDir)
  const env = {
    ...process.env,
    HOME: process.env.HOME || process.env.USERPROFILE || process.cwd(),
    PATH: `${binDir}${isWin ? ';' : ':'}${process.env.PATH || ''}`,
    NPM_CONFIG_PREFIX: nodeDir,
    npm_config_prefix: nodeDir,
    PREFIX: nodeDir,
  }

  if (isWin) {
    env.NPM_CONFIG_SCRIPT_SHELL = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
    env.NPM_CONFIG_LOGLEVEL = 'error'
    env.NPM_CONFIG_UPDATE_NOTIFIER = 'false'
    env.NPM_CONFIG_FUND = 'false'
    env.NPM_CONFIG_AUDIT = 'false'
  }

  let lastErr
  for (const registry of registries) {
    try {
      console.log(`Installing ${packageSpec} from ${registry}`)
      execFileSync(nodeBin, [
        npmCli,
        'install',
        '-g',
        packageSpec,
        `--registry=${registry}`,
        '--loglevel=error',
        `--prefix=${nodeDir}`,
      ], {
        cwd: nodeDir,
        env,
        stdio: 'inherit',
      })
      return registry
    } catch (e) {
      lastErr = e
      console.warn(`  openclaw install failed from ${registry}: ${e.message}`)
    }
  }

  throw new Error(`Failed to install ${packageSpec}: ${lastErr?.message}`)
}

function writeRuntimeManifest(nodeDir) {
  const manifestPath = join(nodeDir, 'clawbox-runtime.json')
  writeFileSync(manifestPath, JSON.stringify({
    formatVersion: 1,
    nodeVersion: `v${nodeVersion}`,
    openclawVersion,
  }, null, 2))
}

function verifyRuntime(nodeDir) {
  const openclawBin = isWin ? join(nodeDir, 'openclaw.cmd') : join(nodeDir, 'bin', 'openclaw')
  const pkgDir = isWin
    ? join(nodeDir, 'node_modules', 'openclaw')
    : join(nodeDir, 'lib', 'node_modules', 'openclaw')
  const pkgJsonPath = join(pkgDir, 'package.json')

  if (!existsSync(openclawBin)) {
    throw new Error(`Bundled openclaw binary not found: ${openclawBin}`)
  }
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`Bundled openclaw package.json not found: ${pkgJsonPath}`)
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
  if (pkg.version !== openclawVersion) {
    throw new Error(`Bundled openclaw version mismatch: expected ${openclawVersion}, got ${pkg.version}`)
  }
}

function walkFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

function looksLikeNativeCandidate(filePath) {
  const ext = extname(filePath)
  if (ext === '.node' || ext === '.dylib' || ext === '.so') return true
  try {
    return (statSync(filePath).mode & 0o111) !== 0
  } catch {
    return false
  }
}

function detectMachOType(filePath) {
  try {
    const desc = execFileSync('file', ['-b', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!desc.includes('Mach-O')) return null
    const ext = extname(filePath)
    const useRuntime = ext !== '.node' && ext !== '.dylib' && ext !== '.so'
    return { desc, useRuntime }
  } catch {
    return null
  }
}

function ensureMacNodeEntitlements() {
  if (existsSync(macNodeEntitlementsPath)) return macNodeEntitlementsPath
  writeFileSync(macNodeEntitlementsPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
`, 'utf8')
  return macNodeEntitlementsPath
}

function signMacRuntime(nodeDir) {
  if (process.platform !== 'darwin') return

  const identity = resolveMacSigningIdentity()
  if (!identity) {
    console.warn('No Developer ID Application identity found, skipping portable runtime signing')
    return
  }

  const machOFiles = walkFiles(nodeDir)
    .filter((filePath) => looksLikeNativeCandidate(filePath))
    .map((filePath) => ({ filePath, info: detectMachOType(filePath) }))
    .filter((entry) => entry.info)

  if (machOFiles.length === 0) {
    console.log('No Mach-O files detected inside portable runtime')
    return
  }

  console.log(`Signing ${machOFiles.length} Mach-O files inside portable runtime with ${identity}`)
  for (const { filePath, info } of machOFiles) {
    const args = ['--force', '--sign', identity, '--timestamp']
    if (info.useRuntime) {
      args.push('--options', 'runtime')
      if (basename(filePath) === 'node') {
        args.push('--entitlements', ensureMacNodeEntitlements())
      }
    }
    args.push(filePath)
    execFileSync('codesign', args, { stdio: 'inherit' })
  }
}

async function main() {
  console.log(`Preparing portable runtime for ${platformArch}`)
  console.log(`Target Node.js: v${nodeVersion}`)
  console.log(`Target openclaw: ${openclawVersion}`)

  await ensureSourceArchive()

  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })

  console.log(`Extracting source archive into ${workDir}`)
  extractArchive(sourceArchivePath, workDir)

  const nodeDir = resolve(workDir, dirName)
  if (!existsSync(nodeDir)) {
    throw new Error(`Extracted runtime directory not found: ${nodeDir}`)
  }

  installOpenclaw(nodeDir)
  writeRuntimeManifest(nodeDir)
  verifyRuntime(nodeDir)
  signMacRuntime(nodeDir)

  console.log(`Packing portable runtime to ${outPath}`)
  await packArchive(nodeDir, outPath)
  rmSync(workDir, { recursive: true, force: true })

  mkdirSync(dirname(metaPath), { recursive: true })
  writeFileSync(metaPath, JSON.stringify(expectedMeta, null, 2))
  console.log(`Portable runtime ready: ${outPath}`)
}

main().catch((err) => {
  console.error(`Failed to prepare portable runtime: ${err.message}`)
  process.exit(1)
})
