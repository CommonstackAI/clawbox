import { create } from 'zustand'
import { titlesApi } from '@/services/api'

function normalizeId(id: string): string {
  return id.toLowerCase()
}

interface TitleState {
  titles: Record<string, string>
  loadTitles: () => Promise<void>
  getTitle: (sessionId: string) => string | undefined
  setTitle: (sessionId: string, title: string) => Promise<void>
  deleteTitle: (sessionId: string) => Promise<void>
  generateTitle: (sessionId: string, message: string) => Promise<string | undefined>
}

export const useTitleStore = create<TitleState>((set, get) => ({
  titles: {},

  loadTitles: async () => {
    try {
      const { titles } = await titlesApi.getAll()
      // Normalize all keys to lowercase
      const normalized: Record<string, string> = {}
      for (const [k, v] of Object.entries(titles)) {
        normalized[normalizeId(k)] = v
      }
      set({ titles: normalized })
    } catch (e) {
      console.error('Failed to load titles:', e)
    }
  },

  getTitle: (sessionId) => get().titles[normalizeId(sessionId)],

  setTitle: async (sessionId, title) => {
    const key = normalizeId(sessionId)
    set(s => ({ titles: { ...s.titles, [key]: title } }))
    try {
      await titlesApi.set(sessionId, title)
    } catch (e) {
      console.error('Failed to persist title:', e)
    }
  },

  deleteTitle: async (sessionId) => {
    const key = normalizeId(sessionId)
    set(s => {
      const { [key]: _, ...rest } = s.titles
      return { titles: rest }
    })
    try {
      await titlesApi.delete(sessionId)
    } catch (e) {
      console.error('Failed to delete title:', e)
    }
  },

  generateTitle: async (sessionId, message) => {
    try {
      const { title } = await titlesApi.generate(sessionId, message)
      if (title) {
        const key = normalizeId(sessionId)
        set(s => ({ titles: { ...s.titles, [key]: title } }))
        return title
      }
    } catch (e) {
      console.error('Failed to generate title:', e)
    }
    return undefined
  },
}))
