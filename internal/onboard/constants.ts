import { join } from 'path'
import { homedir } from 'os'
import compatibility from '../compatibility.json'

export const TARGET_OPENCLAW_VERSION = compatibility.openclaw.targetVersion

export const OPENCLAW_CONFIG = join(homedir(), '.openclaw', 'openclaw.json')
export const GATEWAY_PORT = 18789

// ClawBox onboard state (stored in .wrapperbox to track portable runtime setup)
export const WRAPPERBOX_DIR = join(homedir(), '.wrapperbox')
export const ONBOARD_STATE_FILE = join(WRAPPERBOX_DIR, 'onboard-state.json')

// Platform-specific service descriptor files (each contains OPENCLAW_GATEWAY_TOKEN)
export const GATEWAY_PLIST = join(homedir(), 'Library', 'LaunchAgents', 'ai.openclaw.gateway.plist') // macOS
export const GATEWAY_SYSTEMD_UNIT = join(homedir(), '.config', 'systemd', 'user', 'openclaw-gateway.service') // Linux
export const GATEWAY_TASK_SCRIPT = join(homedir(), '.openclaw', 'gateway.cmd') // Windows
