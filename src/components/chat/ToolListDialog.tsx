import { Wrench, X } from 'lucide-react'
import { useState } from 'react'
import type { ToolCallData } from '@/types'
import { ToolCallLine } from './ToolCallLine'
import { ToolCallDialog } from './ToolCallDialog'

interface ToolListDialogProps {
  toolCalls: ToolCallData[]
  onClose: () => void
}

export function ToolListDialog({ toolCalls, onClose }: ToolListDialogProps) {
  const [selectedToolCall, setSelectedToolCall] = useState<ToolCallData | null>(null)

  if (toolCalls.length === 0) return null

  if (selectedToolCall) {
    return <ToolCallDialog toolCall={selectedToolCall} onClose={() => setSelectedToolCall(null)} />
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-medium">
            <Wrench className="h-4 w-4" />
            工具调用 ({toolCalls.length})
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {toolCalls.map((tc, i) => (
            <ToolCallLine key={tc.toolCallId || i} toolCall={tc} onClick={setSelectedToolCall} />
          ))}
        </div>
      </div>
    </div>
  )
}
