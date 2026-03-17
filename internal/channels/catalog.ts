import type { ChannelCatalogItem } from './types'
import catalogData from '../generated/channel-catalog.json'

let cachedCatalog: ChannelCatalogItem[] | null = null

function loadCatalog(): ChannelCatalogItem[] {
  if (cachedCatalog) return cachedCatalog
  cachedCatalog = (catalogData as ChannelCatalogItem[])
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return cachedCatalog
}

export function listChannelCatalog(): ChannelCatalogItem[] {
  return loadCatalog().map((item) => ({ ...item }))
}

export function getChannelCatalogItem(id: string): ChannelCatalogItem | null {
  const normalized = id.trim().toLowerCase()
  return loadCatalog().find((item) => item.id.toLowerCase() === normalized) ?? null
}

export function getOrderedChannelCatalogIds(): string[] {
  return loadCatalog().map((item) => item.id)
}
