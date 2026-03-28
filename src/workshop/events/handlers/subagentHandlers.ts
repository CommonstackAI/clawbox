/**
 * Subagent Event Handlers
 *
 * Handles spawning and removing subagent visualizations
 * when Task tools start and complete.
 *
 * Supports both legacy Claude Code events (Task tool) and
 * universal agent protocol events (delegate category / subagent_spawn).
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - EventBus passed as parameter (no singleton)
 * - Types imported from ../../types
 */

import type { EventBus } from '../EventBus'
import type {
  PreToolUseEvent,
  PostToolUseEvent,
  ToolStartEvent,
  ToolEndEvent,
  SubagentSpawnEvent,
  SubagentEndEvent,
} from '../../types'

/**
 * Register subagent-related event handlers
 */
export function registerSubagentHandlers(bus: EventBus): void {
  // Spawn subagent when Task tool starts (legacy)
  bus.on('pre_tool_use', (event: PreToolUseEvent, ctx) => {
    if (!ctx.session) return
    if (event.tool !== 'Task') return

    const description = (event.toolInput as { description?: string }).description
    ctx.session.subagents.spawn(event.toolUseId, description)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })

  // Remove subagent when Task tool completes (legacy)
  bus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!ctx.session) return
    if (event.tool !== 'Task') return

    ctx.session.subagents.remove(event.toolUseId)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })

  // Spawn subagent when delegate tool starts (universal)
  bus.on('tool_start', (event: ToolStartEvent, ctx) => {
    if (!ctx.session) return
    if (event.tool.category !== 'delegate') return

    const description = event.context || event.input?.description as string | undefined
    ctx.session.subagents.spawn(event.tool.id, description)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })

  // Remove subagent when delegate tool completes (universal)
  bus.on('tool_end', (event: ToolEndEvent, ctx) => {
    if (!ctx.session) return
    if (event.tool.category !== 'delegate') return

    ctx.session.subagents.remove(event.tool.id)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })

  // Explicit subagent spawn event (universal)
  bus.on('subagent_spawn', (event: SubagentSpawnEvent, ctx) => {
    if (!ctx.session) return
    const id = event.toolUseId || event.id
    ctx.session.subagents.spawn(id, event.description)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })

  // Explicit subagent end event (universal)
  bus.on('subagent_end', (event: SubagentEndEvent, ctx) => {
    if (!ctx.session) return
    const id = event.toolUseId || event.id
    ctx.session.subagents.remove(id)
    ctx.session.stats.activeSubagents = ctx.session.subagents.count
  })
}
