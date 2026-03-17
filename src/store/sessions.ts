import { create } from 'zustand'
import { sessionsApi } from '@/services/api'
import type { SessionListItem } from '@/types'

interface SessionState {
  sessions: SessionListItem[]
  currentSessionId: string | null
  isLoading: boolean
  loadSessions: () => Promise<void>
  setCurrentSession: (id: string | null) => void
  deleteSession: (id: string) => Promise<void>
  resetSession: (id: string) => Promise<void>
  compactSession: (id: string) => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  isLoading: false,

  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const { sessions } = await sessionsApi.list()
      const items: SessionListItem[] = sessions.map((s: any) => ({
        id: s.id || s.sessionId,
        sessionKey: s.sessionKey || s.key || s.id || s.sessionId,
        originalSessionId: s.originalSessionId || s.sessionId,
        title: s.title || s.id,
        updatedAt: s.updatedAt || new Date().toISOString(),
        createdAt: s.createdAt || new Date().toISOString(),
        messageCount: s.messageCount || 0,
        source: s.source || 'openclaw',
      }))
      set({ sessions: items, isLoading: false })
    } catch (e) {
      console.error('Failed to load sessions:', e)
      set({ isLoading: false })
    }
  },

  setCurrentSession: (id) => set({ currentSessionId: id }),

  deleteSession: async (id) => {
    await sessionsApi.delete(id)
    if (get().currentSessionId === id) set({ currentSessionId: null })
    await get().loadSessions()
  },

  resetSession: async (id) => {
    await sessionsApi.reset(id)
    await get().loadSessions()
  },

  compactSession: async (id) => {
    await sessionsApi.compact(id)
    await get().loadSessions()
  },
}))
