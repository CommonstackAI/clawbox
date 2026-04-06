/**
 * Animation Handlers
 *
 * Triggers context-aware animations based on tool completion.
 * Claude reacts to what just happened with relevant idle animations.
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - EventBus passed as parameter (no singleton)
 * - Types imported from ../../types
 */

import type { EventBus } from '../EventBus'
import type { PostToolUseEvent } from '../../types'

/** Inline BashToolInput shape (not exported from types) */
interface BashToolInput {
  command: string
  description?: string
}

// Command patterns for detecting specific bash operations
const PATTERNS = {
  gitCommit: /\bgit\s+commit\b/,
  gitPush: /\bgit\s+push\b/,
  npmTest: /\b(npm\s+(run\s+)?test|jest|vitest|pytest|go\s+test|bun\s+test)\b/,
  npmBuild: /\b(npm\s+run\s+build|make\b|cargo\s+build|tsc\b|vite\s+build)\b/,
}

// Track recent reads for "exploring" detection
let recentReadCount = 0
let recentReadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Pick an animation based on what just happened
 */
function pickAnimation(event: PostToolUseEvent): string | null {
  const { tool, toolInput, success, duration } = event

  // Bash command patterns - most specific first
  if (tool === 'Bash') {
    const cmd = (toolInput as unknown as BashToolInput).command || ''

    // Git operations
    if (PATTERNS.gitCommit.test(cmd) && success) return 'victoryDance'
    if (PATTERNS.gitPush.test(cmd) && success) return 'wave'

    // Test results - animate regardless of other factors
    if (PATTERNS.npmTest.test(cmd)) {
      return success ? 'happyBounce' : 'headShake'
    }

    // Build completion
    if (PATTERNS.npmBuild.test(cmd) && success) return 'stretch'
  }

  // Long-running commands make Claude sleepy
  if (duration && duration > 10000) return 'sleepyNod'

  // Write = created something new
  if (tool === 'Write' && success) return 'happyBounce'

  // Track reads for "exploring" behavior
  if (tool === 'Read' && success) {
    recentReadCount++
    if (recentReadTimer) clearTimeout(recentReadTimer)
    recentReadTimer = setTimeout(() => {
      recentReadCount = 0
    }, 5000) // Reset after 5s of no reads

    // Many reads in quick succession = exploring
    if (recentReadCount >= 5) {
      recentReadCount = 0
      return 'curiousTilt'
    }
  }

  // Generic failure - but not for every tool (too noisy)
  // Only for important tools where failure is notable
  if (!success && ['Bash', 'Write', 'Edit'].includes(tool)) {
    return 'headShake'
  }

  return null // No special animation
}

export function registerAnimationHandlers(bus: EventBus): void {
  bus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    // Need a character to animate
    if (!ctx.session?.claude) return

    const animation = pickAnimation(event)
    if (animation) {
      // Small delay so character settles into idle first
      setTimeout(() => {
        // Re-check session exists (could be gone after delay)
        if (ctx.session?.claude) {
          ctx.session.claude.playIdleBehavior(animation)
        }
      }, 300)
    }
  })
}
