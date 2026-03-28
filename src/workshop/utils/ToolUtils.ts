/**
 * ToolUtils — Vendored from Vibecraft2. Tool display helpers.
 */

import { CATEGORY_ICON_MAP } from '../types'
import type { ToolCategory } from '../types'

export function getToolIcon(tool: string): string {
  const icons: Record<string, string> = {
    Read: '\u{1F4D6}',
    Edit: '\u270F\uFE0F',
    Write: '\u{1F4DD}',
    Bash: '\u{1F4BB}',
    Grep: '\u{1F50D}',
    Glob: '\u{1F4C1}',
    WebFetch: '\u{1F310}',
    WebSearch: '\u{1F50E}',
    Task: '\u{1F916}',
    TodoWrite: '\u{1F4CB}',
    NotebookEdit: '\u{1F4D3}',
    AskFollowupQuestion: '\u2753',
  }
  return icons[tool] ?? '\u{1F527}'
}

export function getToolIconByCategory(category: ToolCategory): string {
  return CATEGORY_ICON_MAP[category] ?? '\u{1F527}'
}

export function getToolContext(tool: string, input: Record<string, unknown>): string | null {
  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'NotebookEdit': {
      const path = (input.file_path || input.notebook_path) as string
      return path ? (path.split('/').pop() || path) : null
    }
    case 'Bash': {
      const cmd = input.command as string
      if (cmd) {
        const firstLine = cmd.split('\n')[0]
        return firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine
      }
      return null
    }
    case 'Grep': {
      const pattern = input.pattern as string
      return pattern ? `/${pattern}/` : null
    }
    case 'Glob':
      return (input.pattern as string) || null
    case 'WebFetch': {
      const url = input.url as string
      if (url) {
        try { return new URL(url).hostname } catch { return url.slice(0, 30) }
      }
      return null
    }
    case 'WebSearch':
      return input.query ? `"${input.query}"` : null
    case 'Task':
      return (input.description as string) || null
    case 'TodoWrite':
      return 'Updating tasks'
    default:
      return null
  }
}

export function getToolContextByCategory(
  category: ToolCategory,
  input: Record<string, unknown>,
): string | null {
  switch (category) {
    case 'read':
    case 'write':
    case 'edit': {
      const path = (input.file_path || input.path || input.filename) as string
      return path ? (path.split('/').pop() || path) : null
    }
    case 'execute': {
      const cmd = (input.command || input.cmd) as string
      if (cmd) {
        const firstLine = cmd.split('\n')[0]
        return firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine
      }
      return null
    }
    case 'search': {
      const pattern = (input.pattern || input.query || input.search) as string
      return pattern ? `/${pattern}/` : null
    }
    case 'network': {
      const url = (input.url || input.endpoint) as string
      if (url) {
        try { return new URL(url).hostname } catch { return url.slice(0, 30) }
      }
      return null
    }
    case 'delegate':
      return (input.description || input.task) as string || null
    case 'plan':
      return (input.description || input.task) as string || null
    default:
      return null
  }
}
