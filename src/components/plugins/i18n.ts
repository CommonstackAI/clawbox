import type { TFunction } from 'i18next'
import type { ChannelCatalogItem, ChannelSummary } from '@/types'

export function getLocalizedChannelDescription(params: {
  channelId: string
  catalog?: ChannelCatalogItem
  summary?: ChannelSummary
  t: TFunction
  exists: (key: string) => boolean
}): string {
  const { channelId, catalog, summary, t, exists } = params
  const key = `plugins.channels.catalog.${channelId}.description`
  if (exists(key)) return t(key)
  return summary?.description || catalog?.description || t('plugins.channels.noDescription')
}

export function getLocalizedChannelDetailLabel(params: {
  channelId: string
  catalog?: ChannelCatalogItem
  summary?: ChannelSummary
  t: TFunction
  exists: (key: string) => boolean
}): string | undefined {
  const { channelId, catalog, summary, t, exists } = params
  const key = `plugins.channels.catalog.${channelId}.detailLabel`
  if (exists(key)) return t(key)
  return summary?.detailLabel || catalog?.detailLabel
}
