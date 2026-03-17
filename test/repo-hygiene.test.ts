// @vitest-environment node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const ROOT = resolve(__dirname, '..')

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.icns',
  '.pdf',
  '.zip',
  '.exe',
  '.dmg',
  '.woff',
  '.woff2',
  '.ttf',
])

function listTrackedFiles(): string[] {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

function isBinary(relativePath: string, buffer: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(extname(relativePath).toLowerCase())) return true
  return buffer.includes(0)
}

describe('repo hygiene', () => {
  afterEach(() => {
    delete process.env.CLAWBOX_HOME
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('does not keep legacy product branding, paths, or repo references in tracked text files', () => {
    const forbiddenPatterns = [
      new RegExp(`${'Wrapper'}${'Box'}`, 'g'),
      new RegExp(`${'Wrapper'}${'box'}`, 'g'),
      new RegExp(`${'WRAPPER'}${'BOX'}`, 'g'),
      new RegExp(`get${'Wrapper'}${'box'}Home`, 'g'),
      new RegExp(`${'FantWu2024'}/${'Wrapper'}${'Box'}`, 'g'),
      new RegExp(`\\.${'wrapper'}${'box'}\\b`, 'g'),
      new RegExp(`${'wrapper'}${'box'}-${'runtime'}\\.json`, 'g'),
    ]

    const findings: string[] = []

    for (const relativePath of listTrackedFiles()) {
      const absolutePath = resolve(ROOT, relativePath)
      if (!existsSync(absolutePath)) continue

      const buffer = readFileSync(absolutePath)
      if (isBinary(relativePath, buffer)) continue

      const text = buffer.toString('utf8')
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(text)) {
          findings.push(relativePath)
          break
        }
      }
    }

    expect(findings).toEqual([])
  })

  it('uses ~/.clawbox as the default local app home and clawbox-runtime.json for the portable runtime manifest', async () => {
    const fakeHome = '/tmp/clawbox-home'

    vi.doMock('os', async () => {
      const actual = await vi.importActual<typeof import('os')>('os')
      return {
        ...actual,
        homedir: () => fakeHome,
      }
    })

    const configModule = await import('../internal/config/index.ts')
    const runtimeModule = await import('../internal/onboard/node-runtime.ts')

    expect(configModule.getConfigPath()).toBe(join(fakeHome, '.clawbox', 'config.json5'))
    expect(runtimeModule.getPortableRuntimeManifestPath('/tmp/runtime')).toBe(
      join('/tmp/runtime', 'clawbox-runtime.json'),
    )
  })
})
