import { Icon, addCollection, getIcon } from '@iconify/react'
import { BookOpen, Globe, MessageSquare, Send, Shuffle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { logosSubset, simpleIconsSubset } from '@/components/plugins/channel-icon-data'

type ChannelIconSpec = {
  iconifyName?: string
  brandColor?: string
  fallbackIcon: LucideIcon
}

type ChannelIconPresentation = {
  backgroundColor: string | null
  brandColor: string | null
  isBrandIcon: boolean
}

type ChannelIconProps = {
  iconKey?: string
  channelId: string
  className?: string
}

const BRAND_ICON_BACKGROUND_ALPHA = 0.14

const DEFAULT_ICON_SPEC: ChannelIconSpec = {
  fallbackIcon: Globe,
}

const CHANNEL_ICON_REGISTRY: Record<string, ChannelIconSpec> = {
  telegram: {
    iconifyName: 'simple-icons:telegram',
    brandColor: '#26A5E4',
    fallbackIcon: Send,
  },
  whatsapp: {
    iconifyName: 'simple-icons:whatsapp',
    brandColor: '#25D366',
    fallbackIcon: MessageSquare,
  },
  discord: {
    iconifyName: 'simple-icons:discord',
    brandColor: '#5865F2',
    fallbackIcon: MessageSquare,
  },
  irc: {
    fallbackIcon: Shuffle,
  },
  googlechat: {
    iconifyName: 'simple-icons:googlechat',
    brandColor: '#34A853',
    fallbackIcon: MessageSquare,
  },
  slack: {
    iconifyName: 'logos:slack',
    brandColor: '#4A154B',
    fallbackIcon: MessageSquare,
  },
  signal: {
    iconifyName: 'simple-icons:signal',
    brandColor: '#3B45FD',
    fallbackIcon: MessageSquare,
  },
  imessage: {
    iconifyName: 'simple-icons:imessage',
    brandColor: '#34DA50',
    fallbackIcon: MessageSquare,
  },
  feishu: {
    fallbackIcon: BookOpen,
  },
  nostr: {
    fallbackIcon: Globe,
  },
  msteams: {
    iconifyName: 'logos:microsoft-teams',
    brandColor: '#5059C9',
    fallbackIcon: BookOpen,
  },
  mattermost: {
    iconifyName: 'simple-icons:mattermost',
    brandColor: '#0058CC',
    fallbackIcon: MessageSquare,
  },
  'nextcloud-talk': {
    iconifyName: 'simple-icons:nextcloud',
    brandColor: '#0082C9',
    fallbackIcon: MessageSquare,
  },
  matrix: {
    iconifyName: 'simple-icons:matrix',
    brandColor: '#000000',
    fallbackIcon: MessageSquare,
  },
  bluebubbles: {
    fallbackIcon: MessageSquare,
  },
  line: {
    iconifyName: 'simple-icons:line',
    brandColor: '#00C300',
    fallbackIcon: MessageSquare,
  },
  zalo: {
    iconifyName: 'simple-icons:zalo',
    brandColor: '#0068FF',
    fallbackIcon: MessageSquare,
  },
  zalouser: {
    fallbackIcon: MessageSquare,
  },
  'synology-chat': {
    iconifyName: 'simple-icons:synology',
    brandColor: '#B5B5B6',
    fallbackIcon: MessageSquare,
  },
  tlon: {
    fallbackIcon: Globe,
  },
}

addCollection(simpleIconsSubset as Parameters<typeof addCollection>[0])
addCollection(logosSubset as Parameters<typeof addCollection>[0])

function normalizeChannelKey(value?: string): string {
  return value?.trim().toLowerCase() ?? ''
}

function resolveChannelIconSpec(iconKey?: string, channelId?: string): ChannelIconSpec {
  const normalizedIconKey = normalizeChannelKey(iconKey)
  const normalizedChannelId = normalizeChannelKey(channelId)

  if (normalizedIconKey && CHANNEL_ICON_REGISTRY[normalizedIconKey]) {
    return CHANNEL_ICON_REGISTRY[normalizedIconKey]
  }

  if (normalizedChannelId && CHANNEL_ICON_REGISTRY[normalizedChannelId]) {
    return CHANNEL_ICON_REGISTRY[normalizedChannelId]
  }

  return DEFAULT_ICON_SPEC
}

function resolveRegisteredIconName(spec: ChannelIconSpec): string | null {
  if (!spec.iconifyName) return null
  return getIcon(spec.iconifyName) ? spec.iconifyName : null
}

function hexToRgba(hex: string, alpha: number): string | null {
  const normalized = hex.replace('#', '').trim()
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null

  const red = Number.parseInt(expanded.slice(0, 2), 16)
  const green = Number.parseInt(expanded.slice(2, 4), 16)
  const blue = Number.parseInt(expanded.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function getChannelIconPresentation(iconKey?: string, channelId?: string): ChannelIconPresentation {
  const spec = resolveChannelIconSpec(iconKey, channelId)
  const registeredIconName = resolveRegisteredIconName(spec)

  if (!registeredIconName || !spec.brandColor) {
    return {
      backgroundColor: null,
      brandColor: null,
      isBrandIcon: false,
    }
  }

  return {
    backgroundColor: hexToRgba(spec.brandColor, BRAND_ICON_BACKGROUND_ALPHA),
    brandColor: spec.brandColor,
    isBrandIcon: true,
  }
}

export function ChannelIcon({ iconKey, channelId, className }: ChannelIconProps) {
  const spec = resolveChannelIconSpec(iconKey, channelId)
  const registeredIconName = resolveRegisteredIconName(spec)

  if (registeredIconName) {
    return (
      <Icon
        icon={registeredIconName}
        className={className}
        style={spec.brandColor ? { color: spec.brandColor } : undefined}
      />
    )
  }

  const FallbackIcon = spec.fallbackIcon
  return <FallbackIcon className={className} />
}
