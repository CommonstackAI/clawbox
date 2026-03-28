/**
 * Character Movement Event Handlers
 *
 * Handles Claude character movement in response to tool use events.
 * Moves character to appropriate stations and sets context labels.
 *
 * Supports both legacy Claude Code events (pre_tool_use/post_tool_use)
 * and universal agent protocol events (tool_start/tool_end).
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - EventBus passed as parameter (no singleton)
 * - Types imported from ../../types
 * - Sound references removed
 */

import type { EventBus } from '../EventBus'
import { getToolContext } from '../../utils/ToolUtils'
import { getStationForTool, getStationForCategory } from '../../types'
import type {
  StationType,
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  UserPromptSubmitEvent,
  ToolStartEvent,
  ToolEndEvent,
  AgentIdleEvent,
  UserInputEvent,
  ToolCategory,
} from '../../types'

/**
 * Resolve station from either a tool name (legacy) or tool category (universal).
 */
function resolveStation(toolName: string, category?: string): StationType {
  // If category is available, prefer it (universal protocol)
  if (category) {
    return getStationForCategory(category as ToolCategory) as StationType
  }
  // Fall back to tool name lookup (legacy)
  return getStationForTool(toolName)
}

/**
 * Register character movement event handlers
 */
export function registerCharacterHandlers(bus: EventBus): void {
  // Move character to station when tool starts (legacy)
  bus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.session) return

    const station = resolveStation(event.tool)

    // Move character to station (skip 'center' - those are MCP browser tools)
    if (station !== 'center') {
      const zoneStation = ctx.session.zone.stations.get(station)
      if (zoneStation) {
        ctx.session.claude.moveToPosition(zoneStation.position, station)
      }
    }

    // Set context text above station
    if (ctx.scene && station !== 'center') {
      const context = getToolContext(event.tool, event.toolInput)
      if (context) {
        ctx.scene.setStationContext(station, context, event.sessionId)
      }

      // Pulse station ring to highlight activity
      ctx.scene.pulseStation(event.sessionId, station)
    }
  })

  // Move character to station when tool starts (universal)
  bus.on('tool_start', (event: ToolStartEvent, ctx) => {
    if (!ctx.session) return

    const station = resolveStation(event.tool.name, event.tool.category)

    if (station !== 'center') {
      const zoneStation = ctx.session.zone.stations.get(station)
      if (zoneStation) {
        ctx.session.claude.moveToPosition(zoneStation.position, station)
      }
    }

    if (ctx.scene && station !== 'center') {
      const context = event.context || getToolContext(event.tool.name, event.input || {})
      if (context) {
        ctx.scene.setStationContext(station, context, event.agentId)
      }
      ctx.scene.pulseStation(event.agentId, station)
    }
  })

  // Set idle state when tool completes (legacy)
  bus.on('post_tool_use', (_event: PostToolUseEvent, ctx) => {
    if (!ctx.session) return

    // Only set idle if character isn't walking
    if (ctx.session.claude.state !== 'walking') {
      ctx.session.claude.setState('idle')
    }
  })

  // Set idle state when tool completes (universal)
  bus.on('tool_end', (_event: ToolEndEvent, ctx) => {
    if (!ctx.session) return
    if (ctx.session.claude.state !== 'walking') {
      ctx.session.claude.setState('idle')
    }
  })

  // Move character back to center when stopped (legacy)
  bus.on('stop', (event: StopEvent, ctx) => {
    if (!ctx.session || !ctx.scene) return

    // Move to zone center
    const centerStation = ctx.session.zone.stations.get('center')
    if (centerStation) {
      ctx.session.claude.moveToPosition(centerStation.position, 'center')
    }

    // Clear station context labels
    ctx.scene.clearAllContexts(event.sessionId)
  })

  // Move character back to center when idle (universal)
  bus.on('agent_idle', (event: AgentIdleEvent, ctx) => {
    if (!ctx.session || !ctx.scene) return

    const centerStation = ctx.session.zone.stations.get('center')
    if (centerStation) {
      ctx.session.claude.moveToPosition(centerStation.position, 'center')
    }
    ctx.scene.clearAllContexts(event.agentId)
  })

  // Set thinking state when user submits prompt (legacy)
  bus.on('user_prompt_submit', (_event: UserPromptSubmitEvent, ctx) => {
    if (!ctx.session) return
    ctx.session.claude.setState('thinking')
  })

  // Set thinking state when user sends input (universal)
  bus.on('user_input', (_event: UserInputEvent, ctx) => {
    if (!ctx.session) return
    ctx.session.claude.setState('thinking')
  })
}
