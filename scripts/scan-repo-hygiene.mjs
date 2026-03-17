#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const args = process.argv.slice(2)
const modeIndex = args.indexOf('--mode')
const mode = modeIndex >= 0 ? args[modeIndex + 1] : 'public'
const root = process.cwd()

const binaryExts = new Set([
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

const scanners = {
  public: [
    { name: 'absolute-user-path', regex: new RegExp(`/${'Users'}/`, 'g') },
    { name: 'openclaw-repo-env', regex: new RegExp(`\\b${'OPENCLAW'}_${'REPO'}\\b`, 'g') },
    { name: 'private-project-claim', regex: new RegExp(`${'private'} ${'project'}`, 'gi') },
    { name: 'legacy-workstation', regex: new RegExp(`${'legacy'} ${'workstation'}`, 'gi') },
  ],
  secrets: [
    { name: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { name: 'github-classic-token', regex: /\bghp_[A-Za-z0-9]{36,}\b/g },
    { name: 'github-fine-grained-token', regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
    { name: 'openai-key', regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
    { name: 'aws-access-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
    { name: 'google-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { name: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  ],
}

if (!(mode in scanners)) {
  console.error(`[scan-repo-hygiene] Unsupported mode: ${mode}`)
  process.exit(1)
}

function isBinary(pathname, buffer) {
  if (binaryExts.has(extname(pathname).toLowerCase())) return true
  return buffer.includes(0)
}

function listTrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
  return output.split('\0').filter(Boolean)
}

function lineForIndex(text, index) {
  const upto = text.slice(0, index)
  return upto.split('\n').length
}

function snippetForIndex(text, index) {
  const lineStart = text.lastIndexOf('\n', index) + 1
  const lineEnd = text.indexOf('\n', index)
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim()
}

const findings = []

for (const relativePath of listTrackedFiles()) {
  const absolutePath = resolve(root, relativePath)
  if (!existsSync(absolutePath)) continue
  const buffer = readFileSync(absolutePath)
  if (isBinary(relativePath, buffer)) continue

  const text = buffer.toString('utf8')
  for (const scanner of scanners[mode]) {
    scanner.regex.lastIndex = 0
    let match
    while ((match = scanner.regex.exec(text))) {
      findings.push({
        file: relativePath,
        line: lineForIndex(text, match.index),
        name: scanner.name,
        snippet: snippetForIndex(text, match.index),
      })
    }
  }
}

if (findings.length > 0) {
  console.error(`[scan-repo-hygiene] ${mode} scan failed with ${findings.length} finding(s):`)
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.name}] ${finding.snippet}`)
  }
  process.exit(1)
}

console.log(`[scan-repo-hygiene] ${mode} scan passed`)
