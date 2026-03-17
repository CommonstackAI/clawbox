import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createLogger } from '../logger'

const log = createLogger('ToolCallSummaries')

const CLAWBOX_HOME = process.env.CLAWBOX_HOME || join(homedir(), '.clawbox')
const SUMMARIES_FILE = join(CLAWBOX_HOME, 'tool-call-summaries.json')

export interface ToolCallSummaryRecord {
  summary: string
  toolName?: string
  updatedAt: number
}

type ToolCallSummaryCache = Record<string, Record<string, ToolCallSummaryRecord>>

let summariesCache: ToolCallSummaryCache = {}

export function loadToolCallSummaries(): ToolCallSummaryCache {
  try {
    if (existsSync(SUMMARIES_FILE)) {
      summariesCache = JSON.parse(readFileSync(SUMMARIES_FILE, 'utf-8'))
    }
  } catch (e: any) {
    log.error(`Failed to load tool call summaries: ${e.message}`)
    summariesCache = {}
  }
  return summariesCache
}

export function getSessionToolCallSummaries(sessionKey: string): Record<string, ToolCallSummaryRecord> {
  return summariesCache[sessionKey] || {}
}

export function setToolCallSummary(
  sessionKey: string,
  toolCallId: string,
  summary: string,
  toolName?: string,
): void {
  const normalizedSummary = summary.trim()
  if (!normalizedSummary) return

  if (!summariesCache[sessionKey]) {
    summariesCache[sessionKey] = {}
  }

  summariesCache[sessionKey][toolCallId] = {
    summary: normalizedSummary,
    toolName,
    updatedAt: Date.now(),
  }

  saveToolCallSummaries()
}

export function deleteSessionToolCallSummaries(sessionKey: string): void {
  if (!(sessionKey in summariesCache)) return
  delete summariesCache[sessionKey]
  saveToolCallSummaries()
}

function saveToolCallSummaries(): void {
  try {
    if (!existsSync(CLAWBOX_HOME)) {
      mkdirSync(CLAWBOX_HOME, { recursive: true })
    }
    writeFileSync(SUMMARIES_FILE, JSON.stringify(summariesCache, null, 2), 'utf-8')
  } catch (e: any) {
    log.error(`Failed to save tool call summaries: ${e.message}`)
  }
}

loadToolCallSummaries()
