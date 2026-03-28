import { create } from 'zustand'

export interface WorkshopFeedItem {
  id: string
  timestamp: number
  type: 'tool_start' | 'tool_end' | 'text' | 'reasoning' | 'done' | 'error'
  label: string
  detail?: string
  icon?: string
}

export interface WorkshopSettings {
  showFeed: boolean
  feedMaxItems: number
}

interface WorkshopState {
  feed: WorkshopFeedItem[]
  settings: WorkshopSettings
  isSceneReady: boolean

  addFeedItem: (item: WorkshopFeedItem) => void
  clearFeed: () => void
  setSceneReady: (ready: boolean) => void
  updateSettings: (partial: Partial<WorkshopSettings>) => void
}

export const useWorkshopStore = create<WorkshopState>((set) => ({
  feed: [],
  settings: {
    showFeed: true,
    feedMaxItems: 100,
  },
  isSceneReady: false,

  addFeedItem: (item) =>
    set((state) => ({
      feed: [...state.feed, item].slice(-state.settings.feedMaxItems),
    })),

  clearFeed: () => set({ feed: [] }),

  setSceneReady: (ready) => set({ isSceneReady: ready }),

  updateSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),
}))
