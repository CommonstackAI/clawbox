/**
 * ClawBoxEventTap — Hooks into the existing chat streaming callbacks
 * to forward events to the Workshop EventBridge.
 *
 * This is a singleton that wraps the streamChat callbacks to also
 * publish events to the workshop scene.
 */

import type { EventBridge } from './EventBridge'

let activeBridge: EventBridge | null = null

/** Set the active bridge instance (called when Workshop mounts) */
export function setActiveBridge(bridge: EventBridge | null): void {
  activeBridge = bridge
}

/** Get the active bridge (used by the callback wrappers) */
export function getActiveBridge(): EventBridge | null {
  return activeBridge
}

/**
 * Workshop-aware callback wrappers.
 * These are called alongside the existing chat store callbacks
 * in useChat.ts to forward events to the workshop.
 */
export const workshopCallbacks = {
  onText: (content: string) => {
    activeBridge?.onText(content)
  },

  onReasoning: (content: string) => {
    activeBridge?.onReasoning(content)
  },

  onToolStart: (data: { name: string; toolCallId: string; args: Record<string, any> }) => {
    activeBridge?.onToolStart(data)
  },

  onToolEnd: (data: { toolCallId: string; name?: string; result: string; error?: boolean }) => {
    activeBridge?.onToolEnd(data)
  },

  onDone: () => {
    activeBridge?.onDone()
  },

  onError: (error: string) => {
    activeBridge?.onError(error)
  },
}
