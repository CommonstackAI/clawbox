import { cn } from '@/lib/utils'
import { getSoulIconComponent, isKnownSoulIconKey, normalizeSoulIconValue } from '@/lib/soul-icons'

type SoulIconBadgeProps = {
  value?: string
  className?: string
}

export function SoulIconBadge({ value, className }: SoulIconBadgeProps) {
  const normalized = normalizeSoulIconValue(value)

  if (isKnownSoulIconKey(normalized)) {
    const Icon = getSoulIconComponent(normalized)
    return <Icon aria-hidden="true" className={cn('h-5 w-5', className)} />
  }

  return (
    <span aria-hidden="true" className={cn('text-lg leading-none', className)}>
      {normalized}
    </span>
  )
}
