/**
 * Workshop Types — Vendored from Vibecraft2 shared/types.ts + shared/agent-protocol.ts
 *
 * Merged and trimmed for ClawBox embedding. Removed WebSocket, session management,
 * hex art, replay, config, and server-specific types not needed for the embedded viewer.
 */

// ============================================================================
// Tool Categories (from agent-protocol.ts)
// ============================================================================

export type ToolCategory =
  | 'read'
  | 'write'
  | 'edit'
  | 'execute'
  | 'search'
  | 'network'
  | 'delegate'
  | 'plan'
  | 'interact'
  | 'other'

export const CATEGORY_STATION_MAP: Record<ToolCategory, string> = {
  read: 'bookshelf',
  write: 'desk',
  edit: 'workbench',
  execute: 'terminal',
  search: 'scanner',
  network: 'antenna',
  delegate: 'portal',
  plan: 'taskboard',
  interact: 'center',
  other: 'center',
}

export function getStationForCategory(category: ToolCategory): string {
  return CATEGORY_STATION_MAP[category] ?? 'center'
}

export const CATEGORY_ICON_MAP: Record<ToolCategory, string> = {
  read: '\u{1F4D6}',
  write: '\u{1F4DD}',
  edit: '\u270F\uFE0F',
  execute: '\u{1F4BB}',
  search: '\u{1F50D}',
  network: '\u{1F310}',
  delegate: '\u{1F916}',
  plan: '\u{1F4CB}',
  interact: '\u{2753}',
  other: '\u{1F527}',
}

// ============================================================================
// Universal Agent Event Types (from agent-protocol.ts)
// ============================================================================

export type AgentEventType =
  | 'tool_start'
  | 'tool_end'
  | 'agent_idle'
  | 'agent_thinking'
  | 'user_input'
  | 'agent_start'
  | 'agent_end'
  | 'notification'
  | 'subagent_spawn'
  | 'subagent_end'

export interface AgentEvent {
  id: string
  timestamp: number
  type: AgentEventType
  agentId: string
  source: string
  cwd?: string
  metadata?: Record<string, unknown>
}

export interface ToolInfo {
  name: string
  category: ToolCategory
  id: string
}

export interface ToolStartEvent extends AgentEvent {
  type: 'tool_start'
  tool: ToolInfo
  input?: Record<string, unknown>
  context?: string
}

export interface ToolEndEvent extends AgentEvent {
  type: 'tool_end'
  tool: ToolInfo
  success: boolean
  duration?: number
  output?: Record<string, unknown>
}

export interface AgentIdleEvent extends AgentEvent {
  type: 'agent_idle'
  reason?: string
  response?: string
}

export interface AgentThinkingEvent extends AgentEvent {
  type: 'agent_thinking'
}

export interface AgentStartEvent extends AgentEvent {
  type: 'agent_start'
  trigger?: 'startup' | 'resume' | 'user_input' | 'other'
}

export interface AgentEndEvent extends AgentEvent {
  type: 'agent_end'
  reason?: string
}

export interface UserInputEvent extends AgentEvent {
  type: 'user_input'
  text: string
}

export interface AgentNotificationEvent extends AgentEvent {
  type: 'notification'
  message: string
  level?: 'info' | 'warning' | 'error' | 'success'
}

export interface SubagentSpawnEvent extends AgentEvent {
  type: 'subagent_spawn'
  parentAgentId: string
  description?: string
  toolUseId?: string
}

export interface SubagentEndEvent extends AgentEvent {
  type: 'subagent_end'
  toolUseId?: string
}

export type UniversalEvent =
  | ToolStartEvent
  | ToolEndEvent
  | AgentIdleEvent
  | AgentThinkingEvent
  | AgentStartEvent
  | AgentEndEvent
  | UserInputEvent
  | AgentNotificationEvent
  | SubagentSpawnEvent
  | SubagentEndEvent

// ============================================================================
// Legacy Hook Event Types (from types.ts)
// ============================================================================

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'stop'
  | 'subagent_stop'
  | 'session_start'
  | 'session_end'
  | 'user_prompt_submit'
  | 'notification'
  | 'pre_compact'

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task'
  | 'TodoWrite'
  | 'AskUserQuestion'
  | 'NotebookEdit'
  | string

export interface BaseEvent {
  id: string
  timestamp: number
  type: HookEventType
  sessionId: string
  cwd: string
}

export interface PreToolUseEvent extends BaseEvent {
  type: 'pre_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolUseId: string
  assistantText?: string
}

export interface PostToolUseEvent extends BaseEvent {
  type: 'post_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolResponse: Record<string, unknown>
  toolUseId: string
  success: boolean
  duration?: number
}

export interface StopEvent extends BaseEvent {
  type: 'stop'
  stopHookActive: boolean
  response?: string
}

export interface UserPromptSubmitEvent extends BaseEvent {
  type: 'user_prompt_submit'
  prompt: string
}

export type ClaudeEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | StopEvent
  | BaseEvent

// ============================================================================
// Visualization State (from types.ts)
// ============================================================================

export type ClaudeState = 'idle' | 'thinking' | 'working' | 'finished'

export type StationType =
  | 'center'
  | 'bookshelf'
  | 'desk'
  | 'workbench'
  | 'terminal'
  | 'scanner'
  | 'antenna'
  | 'portal'
  | 'taskboard'

export const TOOL_STATION_MAP: Record<string, StationType> = {
  Read: 'bookshelf',
  Write: 'desk',
  Edit: 'workbench',
  Bash: 'terminal',
  Grep: 'scanner',
  Glob: 'scanner',
  WebFetch: 'antenna',
  WebSearch: 'antenna',
  Task: 'portal',
  TodoWrite: 'taskboard',
  AskUserQuestion: 'center',
  NotebookEdit: 'desk',
}

export function getStationForTool(tool: string): StationType {
  return TOOL_STATION_MAP[tool] ?? 'center'
}
