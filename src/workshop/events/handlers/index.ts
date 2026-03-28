/**
 * Event Handlers - Barrel Export
 *
 * Import and call registerAllHandlers(bus) to set up EventBus handlers.
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - All register functions accept an EventBus instance (no singleton).
 */

import type { EventBus } from '../EventBus'
import { registerSoundHandlers } from './soundHandlers'
import { registerNotificationHandlers } from './notificationHandlers'
import { registerCharacterHandlers } from './characterHandlers'
import { registerSubagentHandlers } from './subagentHandlers'
import { registerZoneHandlers } from './zoneHandlers'
import { registerFeedHandlers } from './feedHandlers'
import { registerAnimationHandlers } from './animationHandlers'

/**
 * Register all EventBus handlers
 * Call this once during app initialization
 */
export function registerAllHandlers(bus: EventBus): void {
  registerSoundHandlers(bus)
  registerNotificationHandlers(bus)
  registerCharacterHandlers(bus)
  registerSubagentHandlers(bus)
  registerZoneHandlers(bus)
  registerFeedHandlers(bus)
  registerAnimationHandlers(bus)
}

// Re-export individual registrations for testing
export {
  registerSoundHandlers,
  registerNotificationHandlers,
  registerCharacterHandlers,
  registerSubagentHandlers,
  registerZoneHandlers,
  registerFeedHandlers,
  registerAnimationHandlers,
}
