#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const [targetDir, outputFile = 'CHECKSUMS.txt'] = process.argv.slice(2)

if (!targetDir) {
  console.error('Usage: node scripts/write-checksums.mjs <targetDir> [outputFile]')
  process.exit(1)
}

const root = resolve(targetDir)

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

if (!statSync(root).isDirectory()) {
  console.error(`[write-checksums] Not a directory: ${root}`)
  process.exit(1)
}

const lines = listFiles(root)
  .sort((a, b) => a.localeCompare(b))
  .map((file) => {
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex')
    return `${digest}  ${relative(process.cwd(), file)}`
  })

writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf8')
console.log(`[write-checksums] wrote ${lines.length} entries to ${outputFile}`)
