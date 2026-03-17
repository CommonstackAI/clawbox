import {
  BookOpen,
  Bot,
  Brain,
  Globe,
  Handshake,
  Heart,
  Lightbulb,
  Palette,
  Rocket,
  Sparkles,
  SquareTerminal,
  Target,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export type SoulIconKey =
  | 'sparkles'
  | 'target'
  | 'square-terminal'
  | 'palette'
  | 'book-open'
  | 'handshake'
  | 'brain'
  | 'rocket'
  | 'lightbulb'
  | 'bot'
  | 'globe'
  | 'heart'
  | 'wrench'

type SoulIconOption = {
  key: SoulIconKey
  icon: LucideIcon
  labelKey: string
}

export const DEFAULT_SOUL_ICON_KEY: SoulIconKey = 'sparkles'

export const LEGACY_SOUL_ICON_MAP: Record<string, SoulIconKey> = {
  '✨': 'sparkles',
  '🎯': 'target',
  '💻': 'square-terminal',
  '🎨': 'palette',
  '📚': 'book-open',
  '🤝': 'handshake',
}

export const SOUL_ICON_OPTIONS: SoulIconOption[] = [
  { key: 'sparkles', icon: Sparkles, labelKey: 'soul.iconOptions.sparkles' },
  { key: 'target', icon: Target, labelKey: 'soul.iconOptions.target' },
  { key: 'square-terminal', icon: SquareTerminal, labelKey: 'soul.iconOptions.squareTerminal' },
  { key: 'palette', icon: Palette, labelKey: 'soul.iconOptions.palette' },
  { key: 'book-open', icon: BookOpen, labelKey: 'soul.iconOptions.bookOpen' },
  { key: 'handshake', icon: Handshake, labelKey: 'soul.iconOptions.handshake' },
  { key: 'brain', icon: Brain, labelKey: 'soul.iconOptions.brain' },
  { key: 'rocket', icon: Rocket, labelKey: 'soul.iconOptions.rocket' },
  { key: 'lightbulb', icon: Lightbulb, labelKey: 'soul.iconOptions.lightbulb' },
  { key: 'bot', icon: Bot, labelKey: 'soul.iconOptions.bot' },
  { key: 'globe', icon: Globe, labelKey: 'soul.iconOptions.globe' },
  { key: 'heart', icon: Heart, labelKey: 'soul.iconOptions.heart' },
  { key: 'wrench', icon: Wrench, labelKey: 'soul.iconOptions.wrench' },
]

const SOUL_ICON_COMPONENTS: Record<SoulIconKey, LucideIcon> = SOUL_ICON_OPTIONS.reduce((result, option) => {
  result[option.key] = option.icon
  return result
}, {} as Record<SoulIconKey, LucideIcon>)

export function normalizeSoulIconValue(value?: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_SOUL_ICON_KEY
  return LEGACY_SOUL_ICON_MAP[trimmed] ?? trimmed
}

export function isKnownSoulIconKey(value: string): value is SoulIconKey {
  return value in SOUL_ICON_COMPONENTS
}

export function getSoulIconComponent(key: SoulIconKey): LucideIcon {
  return SOUL_ICON_COMPONENTS[key]
}

export function getSoulIconOption(key: SoulIconKey): SoulIconOption {
  return SOUL_ICON_OPTIONS.find(option => option.key === key) ?? SOUL_ICON_OPTIONS[0]
}
