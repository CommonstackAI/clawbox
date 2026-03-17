import { Code, X } from 'lucide-react'
import type { ToolCallData } from '@/types'

interface ToolCallDialogProps {
  toolCall: ToolCallData | null
  onClose: () => void
}

export function ToolCallDialog({ toolCall, onClose }: ToolCallDialogProps) {
  if (!toolCall) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-medium">
            <Code className="h-4 w-4" />
            {toolCall.toolName}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Arguments</div>
            <pre className="bg-[#1e1e1e] rounded-md p-3 text-xs overflow-x-auto text-green-400">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Result</div>
              <pre className="bg-[#1e1e1e] rounded-md p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto text-blue-400 whitespace-pre-wrap break-words">
                {(() => {
                  try { return JSON.stringify(JSON.parse(toolCall.result!), null, 2) }
                  catch { return toolCall.result }
                })()}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
