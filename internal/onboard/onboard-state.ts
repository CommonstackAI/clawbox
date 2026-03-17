import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { ONBOARD_STATE_FILE, WRAPPERBOX_DIR } from './constants'
import { log } from './utils'

export interface OnboardState {
  completed: boolean
  mode: 'portable' | 'system'
  timestamp: string
  nodeVersion?: string
  openclawVersion?: string
}

/**
 * Read the onboard state from ~/.wrapperbox/onboard-state.json
 */
export function readOnboardState(): OnboardState | null {
  try {
    if (!existsSync(ONBOARD_STATE_FILE)) {
      return null
    }
    const raw = readFileSync(ONBOARD_STATE_FILE, 'utf-8')
    return JSON.parse(raw) as OnboardState
  } catch (e: any) {
    log.error(`Failed to read onboard state: ${e.message}`)
    return null
  }
}

/**
 * Write the onboard state to ~/.wrapperbox/onboard-state.json
 */
export function writeOnboardState(state: OnboardState): void {
  try {
    mkdirSync(dirname(ONBOARD_STATE_FILE), { recursive: true })
    writeFileSync(ONBOARD_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8')
    log.info(`Onboard state saved: mode=${state.mode}, completed=${state.completed}`)
  } catch (e: any) {
    log.error(`Failed to write onboard state: ${e.message}`)
  }
}

/**
 * Check if onboard is needed based on:
 * 1. Onboard state file exists in ~/.wrapperbox
 * 2. OpenClaw config exists and has provider configured
 */
export function checkOnboardNeeded(): boolean {
  // Check if onboard state exists
  const state = readOnboardState()
  if (!state || !state.completed) {
    log.info('Onboard needed: state file missing or incomplete')
    return true
  }

  // For portable mode, verify the runtime directory still exists
  if (state.mode === 'portable') {
    const runtimeDir = WRAPPERBOX_DIR
    if (!existsSync(runtimeDir)) {
      log.info('Onboard needed: portable runtime directory missing')
      return true
    }
  }

  log.info(`Onboard not needed: mode=${state.mode}, completed at ${state.timestamp}`)
  return false
}
