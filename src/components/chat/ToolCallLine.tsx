import { Check, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ToolCallData } from '@/types'
import { summarizeToolCall } from '@/lib/tool-call-display'

interface ToolCallLineProps {
  toolCall: ToolCallData
  onClick?: (toolCall: ToolCallData) => void
}

export function ToolCallLine({ toolCall, onClick }: ToolCallLineProps) {
  const { t } = useTranslation()
  const isRunning = toolCall.status === 'running'
  const isError = toolCall.status === 'error'
  const isClickable = !isRunning
  const summary = summarizeToolCall({
    toolName: toolCall.toolName,
    args: toolCall.args,
    summary: toolCall.summary,
    summaryStatus: toolCall.summaryStatus,
    pendingLabel: t('chat.toolCall.usingTool'),
  })

  return (
    <div className="my-0.5">
      <div
        className={`flex items-center gap-1.5 py-1 px-2 rounded select-none transition-colors ${
          isClickable ? 'hover:bg-muted/50 cursor-pointer' : ''
        }`}
        onClick={() => isClickable && onClick?.(toolCall)}
      >
        <span className="flex-shrink-0">
          {isRunning ? (
            <div className="h-4 w-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          ) : isError ? (
            <div className="h-3.5 w-3.5 rounded-full bg-destructive/20 flex items-center justify-center">
              <XCircle className="h-3 w-3 text-destructive" />
            </div>
          ) : (
            <div className="h-3.5 w-3.5 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
            </div>
          )}
        </span>
        <span className="text-[13px] leading-5 text-muted-foreground truncate flex-1">
          {summary}
        </span>
      </div>
    </div>
  )
}
