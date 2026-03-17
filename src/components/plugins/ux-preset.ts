export type ChannelPrimaryAction = 'save_and_activate' | 'start_auth'

export type ChannelUxPreset = {
  essentialFields: string[]
  recommendedFields?: string[]
  primaryAction: ChannelPrimaryAction
}

const presets: Record<string, ChannelUxPreset> = {
  telegram: {
    essentialFields: ['botToken'],
    recommendedFields: ['dmPolicy', 'groupPolicy'],
    primaryAction: 'save_and_activate',
  },
  slack: {
    essentialFields: ['botToken', 'mode', 'appToken', 'signingSecret'],
    recommendedFields: ['dmPolicy', 'groupPolicy', 'requireMention'],
    primaryAction: 'save_and_activate',
  },
  feishu: {
    essentialFields: ['appId', 'appSecret', 'domain', 'connectionMode'],
    recommendedFields: ['dmPolicy', 'groupPolicy', 'requireMention'],
    primaryAction: 'save_and_activate',
  },
  discord: {
    essentialFields: ['token'],
    recommendedFields: ['dmPolicy', 'groupPolicy'],
    primaryAction: 'save_and_activate',
  },
  irc: {
    essentialFields: ['host', 'nick'],
    recommendedFields: ['port', 'tls'],
    primaryAction: 'save_and_activate',
  },
  googlechat: {
    essentialFields: ['webhookPath'],
    recommendedFields: ['dmPolicy', 'groupPolicy'],
    primaryAction: 'save_and_activate',
  },
  signal: {
    essentialFields: ['account', 'httpUrl', 'cliPath'],
    recommendedFields: ['dmPolicy', 'groupPolicy'],
    primaryAction: 'save_and_activate',
  },
  imessage: {
    essentialFields: ['cliPath'],
    recommendedFields: ['service', 'dmPolicy'],
    primaryAction: 'save_and_activate',
  },
  whatsapp: {
    essentialFields: [],
    primaryAction: 'start_auth',
  },
  zalouser: {
    essentialFields: [],
    primaryAction: 'start_auth',
  },
}

const defaultPreset: ChannelUxPreset = {
  essentialFields: ['enabled'],
  primaryAction: 'save_and_activate',
}

export function getChannelUxPreset(channelId: string): ChannelUxPreset {
  return presets[channelId] ?? defaultPreset
}
