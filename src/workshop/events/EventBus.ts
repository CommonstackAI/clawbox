/**
 * EventBus — Vendored from Vibecraft2, adapted for ClawBox embedding.
 * Removed singleton export; instances are created per workshop lifecycle.
 */

import type {
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  UserPromptSubmitEvent,
  ClaudeEvent,
  ToolStartEvent,
  ToolEndEvent,
  AgentIdleEvent,
  AgentThinkingEvent,
  UserInputEvent,
  AgentNotificationEvent,
  SubagentSpawnEvent,
  SubagentEndEvent,
} from '../types'
import type { WorkshopScene } from '../scene/WorkshopScene'

// ============================================================================
// Types
// ============================================================================

export interface EventContext {
  scene: WorkshopScene | null
  session: SessionContext | null
  soundEnabled: boolean
}

export interface SessionContext {
  id: string
  color: number
  claude: any
  subagents: any
  zone: any
  stats: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

export interface EventTypeMap {
  'pre_tool_use': PreToolUseEvent
  'post_tool_use': PostToolUseEvent
  'stop': StopEvent
  'user_prompt_submit': UserPromptSubmitEvent
  'session_start': ClaudeEvent
  'notification': ClaudeEvent
  'tool_start': ToolStartEvent
  'tool_end': ToolEndEvent
  'agent_idle': AgentIdleEvent
  'agent_thinking': AgentThinkingEvent
  'user_input': UserInputEvent
  'agent_notification': AgentNotificationEvent
  'subagent_spawn': SubagentSpawnEvent
  'subagent_end': SubagentEndEvent
}

export type EventType = keyof EventTypeMap

export type EventHandler<T extends EventType> = (
  event: EventTypeMap[T],
  context: EventContext
) => void

// ============================================================================
// EventBus Class
// ============================================================================

export class EventBus {
  private handlers: Map<EventType, Set<EventHandler<any>>> = new Map()

  on<T extends EventType>(type: T, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  emit<T extends EventType>(type: T, event: EventTypeMap[T], context: EventContext): void {
    const handlers = this.handlers.get(type)
    if (!handlers) return

    for (const handler of handlers) {
      try {
        handler(event, context)
      } catch (error) {
        console.error(`[Workshop EventBus] Error in handler for ${type}:`, error)
      }
    }
  }

  off(type: EventType): void {
    this.handlers.delete(type)
  }

  clear(): void {
    this.handlers.clear()
  }

  getHandlerCount(type?: EventType): number {
    if (type) return this.handlers.get(type)?.size ?? 0
    let total = 0
    for (const handlers of this.handlers.values()) total += handlers.size
    return total
  }
}
