import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createLogger } from '../logger'

const log = createLogger('Titles')

const CLAWBOX_HOME = process.env.CLAWBOX_HOME || join(homedir(), '.clawbox')
const TITLES_FILE = join(CLAWBOX_HOME, 'titles.json')

let titlesCache: Record<string, string> = {}

export function loadTitles(): Record<string, string> {
  try {
    if (existsSync(TITLES_FILE)) {
      titlesCache = JSON.parse(readFileSync(TITLES_FILE, 'utf-8'))
    }
  } catch (e: any) {
    log.error(`Failed to load titles: ${e.message}`)
    titlesCache = {}
  }
  return titlesCache
}

export function getAllTitles(): Record<string, string> {
  return titlesCache
}

export function getTitle(sessionId: string): string | undefined {
  return titlesCache[sessionId]
}

export function setTitle(sessionId: string, title: string): void {
  titlesCache[sessionId] = title
  saveTitles()
}

export function deleteTitle(sessionId: string): void {
  delete titlesCache[sessionId]
  saveTitles()
}

function saveTitles(): void {
  try {
    if (!existsSync(CLAWBOX_HOME)) {
      mkdirSync(CLAWBOX_HOME, { recursive: true })
    }
    writeFileSync(TITLES_FILE, JSON.stringify(titlesCache, null, 2), 'utf-8')
  } catch (e: any) {
    log.error(`Failed to save titles: ${e.message}`)
  }
}

// Load on module init
loadTitles()
