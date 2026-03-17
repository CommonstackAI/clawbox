import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const installerPath = join(
  root,
  'src-tauri',
  'target',
  'x86_64-pc-windows-msvc',
  'release',
  'bundle',
  'nsis',
  `ClawBox_${pkg.version}_x64-setup.exe`,
)

console.log(`[sign-win-installer] Signing installer: ${installerPath}`)

execFileSync(process.execPath, [join(root, 'scripts', 'sign-win.mjs'), installerPath], {
  cwd: root,
  stdio: 'inherit',
})
