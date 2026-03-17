import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function GatewayRestartHint({
  children,
  compact = false,
  className,
}: {
  children: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        compact ? 'px-3 py-2 text-xs leading-5' : 'px-4 py-3 text-sm leading-6',
        className,
      )}
    >
      <AlertTriangle className={cn('mt-0.5 shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <div>{children}</div>
    </div>
  )
}
