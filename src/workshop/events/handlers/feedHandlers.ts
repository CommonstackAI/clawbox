/**
 * Feed/UI Event Handlers
 *
 * Handles thinking indicator visibility in the activity feed.
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - EventBus passed as parameter (no singleton)
 * - Types imported from ../../types
 * - FeedManager DOM references removed (no-op stubs for now;
 *   will be wired to React state later)
 */

import type { EventBus } from '../EventBus'
import type { PreToolUseEvent, StopEvent } from '../../types'

/**
 * Register feed-related event handlers
 */
export function registerFeedHandlers(bus: EventBus): void {
  // Hide thinking indicator when tool starts
  // NOTE: feedManager removed; this is a no-op until wired to React state
  bus.on('pre_tool_use', (_event: PreToolUseEvent, _ctx) => {
    // Original: ctx.feedManager.hideThinking(_event.sessionId)
    // Will be wired to React state later
  })

  // Hide thinking indicator on stop
  bus.on('stop', (_event: StopEvent, _ctx) => {
    // Original: ctx.feedManager.hideThinking(event.sessionId)
    // Will be wired to React state later
  })

  // NOTE: showThinking for user_prompt_submit is handled in main.ts
  // AFTER feedManager.add() to ensure correct ordering in the feed
}
