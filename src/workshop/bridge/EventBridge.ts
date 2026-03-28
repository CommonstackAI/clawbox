/**
 * EventBridge — Translates ClawBox SSE chat events into Vibecraft2 EventBus events.
 *
 * This is the key integration layer: ClawBox's streamChat callbacks produce
 * normalized workshop events which are translated to Vibecraft2's EventBus format.
 */

import { nanoid } from 'nanoid'
import { EventBus, type EventContext } from '../events/EventBus'
import { getStationForTool, type ToolCategory, type StationType, TOOL_STATION_MAP } from '../types'
import { getToolIcon, getToolContext } from '../utils/ToolUtils'
import { useWorkshopStore, type WorkshopFeedItem } from '../store/workshop'

/** Map ClawBox tool names to Vibecraft2 tool categories */
function toolNameToCategory(name: string): ToolCategory {
  const map: Record<string, ToolCategory> = {
    Read: 'read',
    Write: 'write',
    Edit: 'edit',
    Bash: 'execute',
    Grep: 'search',
    Glob: 'search',
    WebFetch: 'network',
    WebSearch: 'network',
    Task: 'delegate',
    TodoWrite: 'plan',
    AskUserQuestion: 'interact',
    NotebookEdit: 'edit',
  }
  return map[name] ?? 'other'
}

export class EventBridge {
  private bus: EventBus
  private context: EventContext
  private activeToolIds = new Map<string, string>() // toolCallId → toolUseId

  constructor(bus: EventBus, context: EventContext) {
    this.bus = bus
    this.context = context
  }

  updateContext(context: Partial<EventContext>): void {
    Object.assign(this.context, context)
  }

  /** Called when SSE emits tool_start */
  onToolStart(data: { name: string; toolCallId: string; args: Record<string, any> }): void {
    const toolUseId = nanoid()
    this.activeToolIds.set(data.toolCallId, toolUseId)

    this.bus.emit('tool_start', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'tool_start',
      agentId: 'clawbox-main',
      source: 'clawbox',
      tool: {
        name: data.name,
        category: toolNameToCategory(data.name),
        id: toolUseId,
      },
      input: data.args,
      context: getToolContext(data.name, data.args) ?? undefined,
    }, this.context)

    // Also emit legacy pre_tool_use for handlers that listen to that
    this.bus.emit('pre_tool_use', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'pre_tool_use',
      sessionId: 'clawbox-main',
      cwd: '',
      tool: data.name,
      toolInput: data.args,
      toolUseId,
    }, this.context)

    this.addFeedItem({
      id: nanoid(),
      timestamp: Date.now(),
      type: 'tool_start',
      label: `${data.name}`,
      detail: getToolContext(data.name, data.args) ?? undefined,
      icon: getToolIcon(data.name),
    })
  }

  /** Called when SSE emits tool_end */
  onToolEnd(data: { toolCallId: string; name?: string; result: string; error?: boolean }): void {
    const toolUseId = this.activeToolIds.get(data.toolCallId) ?? nanoid()
    this.activeToolIds.delete(data.toolCallId)

    const toolName = data.name ?? 'tool'

    this.bus.emit('tool_end', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'tool_end',
      agentId: 'clawbox-main',
      source: 'clawbox',
      tool: {
        name: toolName,
        category: toolNameToCategory(toolName),
        id: toolUseId,
      },
      success: !data.error,
    }, this.context)

    this.bus.emit('post_tool_use', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'post_tool_use',
      sessionId: 'clawbox-main',
      cwd: '',
      tool: toolName,
      toolInput: {},
      toolResponse: {},
      toolUseId,
      success: !data.error,
    }, this.context)

    this.addFeedItem({
      id: nanoid(),
      timestamp: Date.now(),
      type: 'tool_end',
      label: `${toolName} ${data.error ? 'failed' : 'done'}`,
      detail: data.result?.slice(0, 100),
      icon: data.error ? '\u274C' : '\u2705',
    })
  }

  /** Called when SSE emits text */
  onText(content: string): void {
    // Only add feed items for substantial text (debounced)
    if (content.length > 20) {
      this.addFeedItem({
        id: nanoid(),
        timestamp: Date.now(),
        type: 'text',
        label: 'Response',
        detail: content.slice(0, 80),
        icon: '\u{1F4AC}',
      })
    }
  }

  /** Called when SSE emits reasoning */
  onReasoning(content: string): void {
    this.bus.emit('agent_thinking', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'agent_thinking',
      agentId: 'clawbox-main',
      source: 'clawbox',
    }, this.context)

    if (content.length > 20) {
      this.addFeedItem({
        id: nanoid(),
        timestamp: Date.now(),
        type: 'reasoning',
        label: 'Thinking',
        detail: content.slice(0, 80),
        icon: '\u{1F4AD}',
      })
    }
  }

  /** Called when SSE emits done */
  onDone(): void {
    this.bus.emit('agent_idle', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'agent_idle',
      agentId: 'clawbox-main',
      source: 'clawbox',
    }, this.context)

    this.bus.emit('stop', {
      id: nanoid(),
      timestamp: Date.now(),
      type: 'stop',
      sessionId: 'clawbox-main',
      cwd: '',
      stopHookActive: false,
    }, this.context)

    this.addFeedItem({
      id: nanoid(),
      timestamp: Date.now(),
      type: 'done',
      label: 'Complete',
      icon: '\u2728',
    })
  }

  /** Called when SSE emits error */
  onError(error: string): void {
    this.addFeedItem({
      id: nanoid(),
      timestamp: Date.now(),
      type: 'error',
      label: 'Error',
      detail: error.slice(0, 100),
      icon: '\u{1F6A8}',
    })
  }

  private addFeedItem(item: WorkshopFeedItem): void {
    useWorkshopStore.getState().addFeedItem(item)
  }

  dispose(): void {
    this.activeToolIds.clear()
  }
}
