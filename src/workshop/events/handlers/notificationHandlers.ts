/**
 * Zone Notification Event Handlers
 *
 * Shows floating notifications above zones when tools complete.
 * Uses ZoneNotifications system for tool-specific styling.
 *
 * Supports both legacy Claude Code events and universal agent protocol events.
 * Universal events use category-based notification formatting.
 *
 * Vendored from Vibecraft2, adapted for ClawBox embedding.
 * - EventBus passed as parameter (no singleton)
 * - Types imported from ../../types
 * - Sound references removed
 * - Inline notification formatting (ZoneNotifications not yet vendored)
 */

import type { EventBus } from '../EventBus'
import type {
  PostToolUseEvent,
  StationType,
  ToolEndEvent,
  ToolCategory,
} from '../../types'
import { getStationForTool, getStationForCategory } from '../../types'

// ============================================================================
// Notification text formatting helpers
// (Inlined from Vibecraft2 scene/ZoneNotifications — not yet vendored)
// ============================================================================

function formatFileChange(
  fileName: string,
  info: { added?: number; removed?: number; lines?: number },
): string {
  if (info.lines !== undefined) {
    return `${fileName} (${info.lines} lines)`
  }
  const parts: string[] = [fileName]
  if (info.added) parts.push(`+${info.added}`)
  if (info.removed) parts.push(`-${info.removed}`)
  return parts.join(' ')
}

function formatCommandResult(command: string): string {
  // Truncate long commands
  const trimmed = command.trim()
  if (trimmed.length > 40) return trimmed.slice(0, 37) + '...'
  return trimmed
}

function formatSearchResult(pattern: string): string {
  if (pattern.length > 30) return pattern.slice(0, 27) + '...'
  return pattern
}

// ============================================================================
// Legacy (tool-name based) notification text
// ============================================================================

/**
 * Extract notification text from tool input based on tool name (legacy).
 */
function getNotificationTextByTool(tool: string, input: Record<string, unknown>): string | null {
  switch (tool) {
    case 'Edit': {
      const filePath = input.file_path as string | undefined
      if (filePath) {
        const fileName = filePath.split('/').pop() || filePath
        const oldStr = input.old_string as string | undefined
        const newStr = input.new_string as string | undefined
        if (oldStr && newStr) {
          const oldLines = (oldStr.match(/\n/g) || []).length + 1
          const newLines = (newStr.match(/\n/g) || []).length + 1
          const added = Math.max(0, newLines - oldLines)
          const removed = Math.max(0, oldLines - newLines)
          return formatFileChange(fileName, { added, removed })
        }
        return fileName
      }
      return null
    }
    case 'Write': {
      const filePath = input.file_path as string | undefined
      if (filePath) {
        const fileName = filePath.split('/').pop() || filePath
        const content = input.content as string | undefined
        if (content) {
          const lines = (content.match(/\n/g) || []).length + 1
          return formatFileChange(fileName, { lines })
        }
        return fileName
      }
      return null
    }
    case 'Read': {
      const filePath = input.file_path as string | undefined
      if (filePath) return filePath.split('/').pop() || filePath
      return null
    }
    case 'Bash': {
      const command = input.command as string | undefined
      return command ? formatCommandResult(command) : null
    }
    case 'Grep':
    case 'Glob': {
      const pattern = input.pattern as string | undefined
      return pattern ? formatSearchResult(pattern) : null
    }
    case 'WebFetch':
    case 'WebSearch': {
      const url = input.url as string | undefined
      const query = input.query as string | undefined
      if (url) {
        try { return new URL(url).hostname } catch { return url.slice(0, 30) }
      }
      if (query) return formatSearchResult(query)
      return null
    }
    case 'Task': {
      const description = input.description as string | undefined
      return description ? description.slice(0, 25) : null
    }
    case 'TodoWrite': {
      const todos = input.todos as Array<{ content?: string }> | undefined
      return (todos && todos.length > 0) ? `${todos.length} items` : null
    }
    default:
      return null
  }
}

// ============================================================================
// Universal (category-based) notification text
// ============================================================================

/**
 * Extract notification text from tool output based on category (universal).
 */
function getNotificationTextByCategory(
  category: ToolCategory,
  toolName: string,
  output?: Record<string, unknown>,
): string | null {
  // Use the tool name as a basic notification
  const name = toolName.length > 25 ? toolName.slice(0, 25) + '...' : toolName
  switch (category) {
    case 'read':
    case 'write':
    case 'edit':
      return output?.file_path
        ? (output.file_path as string).split('/').pop() || name
        : name
    case 'execute':
      return output?.command
        ? formatCommandResult(output.command as string)
        : name
    case 'search':
      return output?.pattern
        ? formatSearchResult(output.pattern as string)
        : name
    case 'network':
      if (output?.url) {
        try { return new URL(output.url as string).hostname } catch { /* fallthrough */ }
      }
      return name
    case 'delegate':
      return output?.description
        ? (output.description as string).slice(0, 25)
        : name
    case 'plan':
      return name
    default:
      return name
  }
}

// ============================================================================
// Handler registration
// ============================================================================

/**
 * Register notification-related event handlers
 */
export function registerNotificationHandlers(bus: EventBus): void {
  // Tool completion notifications (legacy)
  bus.on('post_tool_use', (event: PostToolUseEvent, ctx) => {
    if (!event.success || !ctx.scene) return

    const input = event.toolInput as Record<string, unknown>
    const notificationText = getNotificationTextByTool(event.tool, input)

    if (notificationText) {
      ctx.scene.zoneNotifications.showForTool(event.sessionId, event.tool, notificationText)

      const station = getStationForTool(event.tool)
      if (station !== 'center') {
        ctx.scene.stationPanels.addToolUse(event.sessionId, station, {
          text: notificationText,
          success: event.success,
        })
      }
    }
  })

  // Tool completion notifications (universal)
  bus.on('tool_end', (event: ToolEndEvent, ctx) => {
    if (!event.success || !ctx.scene) return

    const notificationText = getNotificationTextByCategory(
      event.tool.category,
      event.tool.name,
      event.output,
    )

    if (notificationText) {
      ctx.scene.zoneNotifications.showForTool(event.agentId, event.tool.name, notificationText)

      const station = getStationForCategory(event.tool.category) as StationType
      if (station !== 'center') {
        ctx.scene.stationPanels.addToolUse(event.agentId, station as StationType, {
          text: notificationText,
          success: event.success,
        })
      }
    }
  })
}
