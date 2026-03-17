import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseReleaseVersion(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-([1-9]\d*)$/.exec(version)
  if (!match) return null

  return {
    prefix: `${match[1]}.${match[2]}.${match[3]}`,
    sequence: Number(match[4]),
  }
}

export function parseUtcDateInput(input) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) {
    throw new Error(`Invalid --date value "${input}". Expected YYYY-MM-DD.`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid --date value "${input}".`)
  }

  return date
}

export function formatUtcDatePrefix(date) {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`
}

export function getMaxTagSequence(prefix, tags) {
  const tagPattern = new RegExp(`^v${escapeRegex(prefix)}-([1-9]\\d*)$`)
  let maxSequence = 0

  for (const tag of tags) {
    const match = tagPattern.exec(tag.trim())
    if (!match) continue
    maxSequence = Math.max(maxSequence, Number(match[1]))
  }

  return maxSequence
}

export function resolveNextReleaseVersion({ prefix, currentVersion, tags }) {
  const maxTagSequence = getMaxTagSequence(prefix, tags)
  const current = parseReleaseVersion(currentVersion)

  if (current && current.prefix === prefix && current.sequence > maxTagSequence) {
    return {
      version: currentVersion,
      maxTagSequence,
      reusedCurrentVersion: true,
    }
  }

  return {
    version: `${prefix}-${maxTagSequence + 1}`,
    maxTagSequence,
    reusedCurrentVersion: false,
  }
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    date: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--date') {
      const nextValue = argv[index + 1]
      if (!nextValue || nextValue.startsWith('--')) {
        throw new Error('Missing value for --date.')
      }
      options.date = nextValue
      index += 1
      continue
    }

    if (arg.startsWith('--date=')) {
      options.date = arg.slice('--date='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.date === '') {
    throw new Error('Missing value for --date.')
  }

  return options
}

function readPackageVersion() {
  const pkgPath = resolve(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return pkg.version
}

function listLocalTags(prefix) {
  try {
    const stdout = execFileSync('git', ['tag', '--list', `v${prefix}-*`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch (error) {
    throw new Error(`Failed to read local git tags: ${error.message}`)
  }
}

function runNodeScript(scriptPath) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
  })
}

function runNpmVersion(version) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  execFileSync(
    npmCommand,
    ['version', version, '--no-git-tag-version', '--allow-same-version'],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const date = options.date ? parseUtcDateInput(options.date) : new Date()
  const prefix = formatUtcDatePrefix(date)
  const currentVersion = readPackageVersion()
  const tags = listLocalTags(prefix)
  const result = resolveNextReleaseVersion({
    prefix,
    currentVersion,
    tags,
  })

  console.log(`[release-version] UTC date prefix: ${prefix}`)
  console.log(`[release-version] Current package.json version: ${currentVersion}`)
  console.log(`[release-version] Latest local tag sequence: ${result.maxTagSequence}`)
  console.log(`[release-version] Selected release version: ${result.version}`)

  if (options.dryRun) {
    console.log('[release-version] Dry run only. No files were changed.')
    return
  }

  runNpmVersion(result.version)
  runNodeScript(resolve(root, 'scripts/sync-version.mjs'))

  if (result.reusedCurrentVersion) {
    console.log('[release-version] Reused current package version because it is ahead of local tags.')
  } else {
    console.log('[release-version] Bumped package version and synced Tauri/Cargo metadata.')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  try {
    main()
  } catch (error) {
    console.error(`[release-version] ${error.message}`)
    process.exit(1)
  }
}
