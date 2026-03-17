import { Brain, X } from 'lucide-react'

interface ThinkingDialogProps {
  content: string | null
  onClose: () => void
}

export function ThinkingDialog({ content, onClose }: ThinkingDialogProps) {
  if (!content) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-medium">
            <Brain className="h-4 w-4" />
            模型思考过程
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}
