import { useTranslation } from 'react-i18next'
import { SOUL_ICON_OPTIONS, normalizeSoulIconValue } from '@/lib/soul-icons'
import { cn } from '@/lib/utils'

type SoulIconPickerProps = {
  value?: string
  onChange: (value: string) => void
  className?: string
  gridClassName?: string
  showLabel?: boolean
}

export function SoulIconPicker({
  value,
  onChange,
  className,
  gridClassName,
  showLabel = true,
}: SoulIconPickerProps) {
  const { t } = useTranslation()
  const normalizedValue = normalizeSoulIconValue(value)

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel ? (
        <div className="text-xs font-medium text-muted-foreground">
          {t('soul.iconPickerLabel')}
        </div>
      ) : null}
      <div
        role="group"
        aria-label={t('soul.iconPickerLabel')}
        className={cn('grid grid-cols-4 gap-2 sm:grid-cols-6', gridClassName)}
      >
        {SOUL_ICON_OPTIONS.map((option) => {
          const selected = option.key === normalizedValue
          const Icon = option.icon

          return (
            <button
              key={option.key}
              type="button"
              aria-label={t(option.labelKey)}
              aria-pressed={selected}
              title={t(option.labelKey)}
              onClick={() => onChange(option.key)}
              className={cn(
                'flex h-11 w-full items-center justify-center rounded-lg border transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary shadow-sm'
                  : 'border-border/70 bg-background hover:bg-accent',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
