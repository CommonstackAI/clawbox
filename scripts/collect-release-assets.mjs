#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const [outputDir, ...specs] = process.argv.slice(2)

if (!outputDir || specs.length === 0) {
  console.error('Usage: node scripts/collect-release-assets.mjs <outputDir> <sourceDir>=<extension> [...]')
  process.exit(1)
}

const outRoot = resolve(outputDir)
mkdirSync(outRoot, { recursive: true })

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

const copiedNames = new Set()
let copiedCount = 0

for (const spec of specs) {
  const separatorIndex = spec.lastIndexOf('=')
  if (separatorIndex <= 0 || separatorIndex === spec.length - 1) {
    console.error(`[collect-release-assets] Invalid asset spec: ${spec}`)
    process.exit(1)
  }

  const sourceDir = resolve(spec.slice(0, separatorIndex))
  const extension = spec.slice(separatorIndex + 1).toLowerCase()

  if (!extension.startsWith('.')) {
    console.error(`[collect-release-assets] Extension must start with ".": ${extension}`)
    process.exit(1)
  }

  if (!existsSync(sourceDir)) {
    console.error(`[collect-release-assets] Missing source directory: ${sourceDir}`)
    process.exit(1)
  }

  if (!statSync(sourceDir).isDirectory()) {
    console.error(`[collect-release-assets] Not a directory: ${sourceDir}`)
    process.exit(1)
  }

  const matches = listFiles(sourceDir)
    .filter((file) => file.toLowerCase().endsWith(extension))
    .sort((a, b) => a.localeCompare(b))

  if (matches.length === 0) {
    console.error(`[collect-release-assets] No ${extension} files found under ${sourceDir}`)
    process.exit(1)
  }

  for (const file of matches) {
    const fileName = basename(file)
    if (copiedNames.has(fileName)) {
      console.error(`[collect-release-assets] Duplicate asset name detected: ${fileName}`)
      process.exit(1)
    }

    const destination = join(outRoot, fileName)
    copyFileSync(file, destination)
    copiedNames.add(fileName)
    copiedCount += 1
    console.log(`[collect-release-assets] copied ${file} -> ${destination}`)
  }
}

console.log(`[collect-release-assets] copied ${copiedCount} files to ${outRoot}`)
