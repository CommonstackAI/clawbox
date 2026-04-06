/**
 * AnimationTypes - Shared types and utilities for character animations
 *
 * This module provides the foundation for all animation behaviors:
 * - Common interfaces (CharacterParts, AnimationBehavior)
 * - Easing functions for smooth motion
 * - Category system for organizing behaviors
 *
 * To add new animations:
 * 1. Create behavior objects implementing AnimationBehavior
 * 2. Add to the appropriate registry (IDLE_BEHAVIORS, STATION_ANIMATIONS, etc.)
 * 3. Optionally tag with categories for filtering
 */

import * as THREE from 'three'

// ============================================================================
// Character Parts - What can be animated
// ============================================================================

/** Character parts that behaviors can animate */
export interface CharacterParts {
  head: THREE.Group
  leftEye: THREE.Mesh
  rightEye: THREE.Mesh
  leftArm: THREE.Group
  rightArm: THREE.Group
  antenna: THREE.Group
  body: THREE.Group
  mesh: THREE.Group  // Root mesh for whole-body animations
}

// ============================================================================
// Animation Behavior Interface
// ============================================================================

/** Categories for organizing and filtering behaviors */
export type AnimationCategory =
  | 'idle'        // Random idle fidgets
  | 'dance'       // Dance moves
  | 'emote'       // Emotional expressions
  | 'work'        // Station-specific work
  | 'reaction'    // Success/error/completion reactions
  | 'transition'  // State change animations

/**
 * Base animation behavior interface
 *
 * All animations follow this contract:
 * - name: unique identifier
 * - duration: seconds for one cycle
 * - update: called each frame with progress 0→1
 * - reset: cleanup when animation ends (optional but recommended)
 */
export interface AnimationBehavior {
  /** Unique name for debugging and lookup */
  name: string

  /** Duration of one animation cycle in seconds */
  duration: number

  /** Categories for filtering (e.g., ['idle', 'dance']) */
  categories?: AnimationCategory[]

  /**
   * Update the animation
   * @param parts - Character parts to animate
   * @param progress - Animation progress 0→1
   * @param deltaTime - Frame delta time in seconds
   */
  update: (parts: CharacterParts, progress: number, deltaTime: number) => void

  /**
   * Reset character to default pose (called when animation ends)
   * Important: Always implement this to avoid stuck poses!
   */
  reset?: (parts: CharacterParts) => void
}

/** Idle behavior with weight for random selection */
export interface IdleBehavior extends AnimationBehavior {
  /** Probability weight (higher = more likely to be picked) */
  weight: number
}

/** Working behavior with loop control */
export interface WorkingBehavior extends AnimationBehavior {
  /** If true, animation loops until stopped */
  loop: boolean
}

/** Reaction behavior (success, error, etc.) */
export interface ReactionBehavior extends AnimationBehavior {
  /** When to trigger: 'success', 'error', 'complete', etc. */
  trigger: string
}

// ============================================================================
// Easing Functions - For smooth, natural motion
// ============================================================================

/** Smooth ease in-out (slow start, fast middle, slow end) */
export const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

/** Ease out (fast start, slow end) */
export const easeOut = (t: number): number =>
  1 - Math.pow(1 - t, 3)

/** Ease in (slow start, fast end) */
export const easeIn = (t: number): number =>
  t * t * t

/** Bounce easing (playful bouncy motion) */
export const bounce = (t: number): number => {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

/** Elastic easing (springy overshoot) */
export const elastic = (t: number): number => {
  if (t === 0 || t === 1) return t
  const p = 0.3
  const s = p / 4
  return Math.pow(2, -10 * t) * Math.sin((t - s) * (2 * Math.PI) / p) + 1
}

/** Back easing (slight overshoot) */
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

/** Linear (no easing) */
export const linear = (t: number): number => t

// ============================================================================
// Animation Utilities
// ============================================================================

/**
 * Interpolate between two values
 */
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/**
 * Map a value from one range to another
 */
export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin)
}

/**
 * Create a ping-pong value (0→1→0) from progress
 */
export const pingPong = (t: number): number =>
  t < 0.5 ? t * 2 : 2 - t * 2

/**
 * Create a stepped value (discrete steps instead of smooth)
 */
export const stepped = (t: number, steps: number): number =>
  Math.floor(t * steps) / steps

// ============================================================================
// Default Pose - Reset helper
// ============================================================================

/**
 * Reset character to default idle pose
 * Use this in reset() functions or call directly
 */
export const resetToDefaultPose = (parts: CharacterParts): void => {
  // Head
  parts.head.position.set(0, 0.52, 0)
  parts.head.rotation.set(0, 0, 0)

  // Eyes
  parts.leftEye.position.set(-0.07, 0.03, 0.242)
  parts.rightEye.position.set(0.07, 0.03, 0.242)
  parts.leftEye.scale.setScalar(1)
  parts.rightEye.scale.setScalar(1)

  // Arms
  parts.leftArm.rotation.set(0, 0, 0)
  parts.rightArm.rotation.set(0, 0, 0)

  // Antenna
  parts.antenna.rotation.set(0, 0, 0)

  // Body
  parts.body.rotation.set(0, 0, 0)

  // Mesh (root)
  parts.mesh.rotation.z = 0
  // Note: Don't reset mesh position as it's controlled by movement system
}
