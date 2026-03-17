/**
 * Build the backend (internal/) into a single executable using Bun.
 * Output: src-tauri/binaries/clawbox-core-{target}
 */
import { execSync } from 'child_process'
import { mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'src-tauri', 'binaries')

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

// Determine Rust-style target triple
function getTargetTriple() {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'darwin') {
    return arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : 'x86_64-apple-darwin'
  }
  if (platform === 'win32') {
    return 'x86_64-pc-windows-msvc'
  }
  // Linux
  return arch === 'arm64'
    ? 'aarch64-unknown-linux-gnu'
    : 'x86_64-unknown-linux-gnu'
}

const triple = getTargetTriple()
const ext = process.platform === 'win32' ? '.exe' : ''
const outFile = join(outDir, `clawbox-core-${triple}${ext}`)
const entry = join(root, 'internal', 'index.ts')

console.log(`Building backend: ${entry}`)
console.log(`Target: ${triple}`)
console.log(`Output: ${outFile}`)

function hasBun() {
  try {
    execSync('bun --version', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const bunAvailable = hasBun()

if (!bunAvailable) {
  if (existsSync(outFile)) {
    console.warn(`[build-backend] bun not found, reusing existing backend binary: ${outFile}`)
    process.exit(0)
  }
  console.error('[build-backend] bun not found and no prebuilt backend binary is available.')
  console.error('[build-backend] Please install bun, then rerun this command.')
  process.exit(1)
}

try {
  execSync(`bun build --compile --target=bun ${entry} --outfile ${outFile}`, {
    cwd: root,
    stdio: 'inherit',
  })
  console.log('Backend build complete.')
} catch (e) {
  console.error('Backend build failed:', e.message)
  process.exit(1)
}
