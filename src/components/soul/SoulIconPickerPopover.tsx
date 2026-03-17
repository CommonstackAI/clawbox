import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SoulIconBadge } from '@/components/soul/SoulIconBadge'
import { SoulIconPicker } from '@/components/soul/SoulIconPicker'
import { cn } from '@/lib/utils'

type SoulIconPickerPopoverProps = {
  value?: string
  onChange: (value: string) => void
  className?: string
  triggerClassName?: string
}

export function SoulIconPickerPopover({
  value,
  onChange,
  className,
  triggerClassName,
}: SoulIconPickerPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={t('soul.iconPickerLabel')}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className={cn(
          'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border bg-background text-primary transition-colors hover:bg-muted',
          triggerClassName,
        )}
      >
        <SoulIconBadge value={value} className="h-5 w-5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-60 rounded-xl border bg-popover p-2 shadow-lg">
          <SoulIconPicker
            value={value}
            showLabel={false}
            gridClassName="grid-cols-4 sm:grid-cols-4"
            onChange={(nextValue) => {
              onChange(nextValue)
              setOpen(false)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
