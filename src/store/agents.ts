import { create } from 'zustand'
import { agentsApi } from '@/services/api'
import type { AgentSummary, AgentConfig } from '@/types'

interface AgentState {
  agents: AgentSummary[]
  currentAgentId: string | null
  isLoading: boolean
  loadAgents: () => Promise<void>
  setCurrentAgent: (id: string) => void
  createAgent: (config: Partial<AgentConfig>) => Promise<void>
  updateAgent: (id: string, updates: Partial<AgentConfig>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  getCurrentAgent: () => AgentSummary | undefined
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  isLoading: false,

  loadAgents: async () => {
    set({ isLoading: true })
    try {
      const { agents, defaultAgentId } = await agentsApi.list()
      set({
        agents,
        currentAgentId: get().currentAgentId || defaultAgentId || agents[0]?.id || null,
        isLoading: false,
      })
    } catch (e) {
      console.error('Failed to load agents:', e)
      set({ isLoading: false })
    }
  },

  setCurrentAgent: (id) => set({ currentAgentId: id }),

  createAgent: async (config) => {
    await agentsApi.create(config)
    await get().loadAgents()
  },

  updateAgent: async (id, updates) => {
    await agentsApi.update(id, updates)
    await get().loadAgents()
  },

  deleteAgent: async (id) => {
    await agentsApi.delete(id)
    if (get().currentAgentId === id) set({ currentAgentId: null })
    await get().loadAgents()
  },

  getCurrentAgent: () => {
    const { agents, currentAgentId } = get()
    return agents.find(a => a.id === currentAgentId)
  },
}))
