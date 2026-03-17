/**
 * Sign a Windows executable using signtool.
 *
 * Usage:
 *   node scripts/sign-win.mjs <file.exe>
 *   node scripts/sign-win.mjs           (signs both clawbox.exe and clawbox-core sidecar)
 *
 * Environment variables:
 *   WIN_SIGN_THUMBPRINT  - Certificate thumbprint (required)
 *   WIN_SIGN_TIMESTAMP   - Timestamp server URL (default: http://timestamp.comodoca.com)
 *   WIN_SIGN_DIGEST      - Digest algorithm (default: sha256)
 *   WIN_SIGNTOOL         - Path to signtool.exe (auto-detected if not set)
 */
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const thumbprint = process.env.WIN_SIGN_THUMBPRINT
if (!thumbprint) {
  console.warn('[sign-win] WIN_SIGN_THUMBPRINT not set — skipping signing')
  process.exit(0)
}

const timestampUrl = process.env.WIN_SIGN_TIMESTAMP || 'http://timestamp.comodoca.com'
const digest = process.env.WIN_SIGN_DIGEST || 'sha256'

function findSignTool() {
  if (process.env.WIN_SIGNTOOL) return process.env.WIN_SIGNTOOL

  const kitsRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
  if (existsSync(kitsRoot)) {
    try {
      const { stdout } = (() => {
        const r = execSync(
          `dir /b /ad /o-n "${kitsRoot}"`,
          { shell: 'cmd.exe', encoding: 'utf-8' },
        )
        return { stdout: r }
      })()
      const versions = stdout.trim().split(/\r?\n/)
      for (const ver of versions) {
        const p = join(kitsRoot, ver, 'x64', 'signtool.exe')
        if (existsSync(p)) return p
      }
    } catch {}
  }

  return 'signtool.exe'
}

function signFile(file) {
  if (!existsSync(file)) {
    console.error(`[sign-win] File not found: ${file}`)
    process.exit(1)
  }
  const signtool = findSignTool()
  const cmd = `"${signtool}" sign /sha1 ${thumbprint} /fd ${digest} /tr "${timestampUrl}" /td ${digest} "${file}"`
  console.log(`[sign-win] Signing: ${file}`)
  try {
    execSync(cmd, { stdio: 'inherit', shell: 'cmd.exe' })
    console.log(`[sign-win] Signed OK: ${file}`)
  } catch (e) {
    console.error(`[sign-win] Signing FAILED: ${file}`)
    process.exit(1)
  }
}

const explicitFile = process.argv[2]
if (explicitFile) {
  signFile(explicitFile)
} else {
  const target = 'x86_64-pc-windows-msvc'
  const releaseDir = join(root, 'src-tauri', 'target', target, 'release')

  const filesToSign = [
    join(releaseDir, 'clawbox.exe'),
    join(releaseDir, 'clawbox-core.exe'),
  ]

  for (const f of filesToSign) {
    if (existsSync(f)) {
      signFile(f)
    } else {
      console.warn(`[sign-win] Skipped (not found): ${f}`)
    }
  }
}
