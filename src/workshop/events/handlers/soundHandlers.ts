/**
 * Sound Event Handlers — NO-OP VERSION
 *
 * Sound is not vendored in ClawBox. This module exports a no-op
 * registration function to keep the handler barrel consistent.
 *
 * The original Vibecraft2 version registers spatial audio for tool
 * start/end, git commits, subagent spawn/despawn, stop, prompt,
 * and notification events via soundManager.
 */

import type { EventBus } from '../EventBus'

/**
 * Register sound-related event handlers (no-op in ClawBox)
 */
export function registerSoundHandlers(_bus: EventBus): void {
  // Sound is not vendored — intentionally empty.
  // See Vibecraft2 src/events/handlers/soundHandlers.ts for the
  // full implementation if audio support is added later.
}
