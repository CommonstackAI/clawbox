import { create } from 'zustand'
import { cronApi } from '@/services/api'
import type { CronJob, CronStatus, CronRunLogEntry } from '@/types'

export type ChannelOption = { id: string; label: string }

interface CronState {
  jobs: CronJob[]
  status: CronStatus | null
  runs: CronRunLogEntry[]
  runsJobId: string | null
  channels: ChannelOption[]
  loading: boolean
  busy: boolean
  error: string | null
  /** ID of the job currently being executed via "Run Now" */
  runningJobId: string | null

  loadJobs: () => Promise<void>
  loadStatus: () => Promise<void>
  loadChannels: () => Promise<void>
  addJob: (job: Parameters<typeof cronApi.add>[0]) => Promise<boolean>
  updateJob: (id: string, patch: Partial<CronJob>) => Promise<boolean>
  toggleJob: (id: string, enabled: boolean) => Promise<boolean>
  removeJob: (id: string) => Promise<boolean>
  runJob: (id: string) => Promise<boolean>
  loadRuns: (id: string) => Promise<void>
  clearError: () => void
}

/** Polling intervals (ms) to check if the running job has finished */
const RUN_POLL_INTERVALS = [2000, 4000, 6000, 8000, 12000, 18000, 30000, 45000, 60000]

export const useCronStore = create<CronState>((set, get) => ({
  jobs: [],
  status: null,
  runs: [],
  runsJobId: null,
  channels: [],
  loading: false,
  busy: false,
  error: null,
  runningJobId: null,

  loadJobs: async () => {
    set({ loading: true, error: null })
    try {
      const [{ jobs }, status] = await Promise.all([cronApi.list(), cronApi.status()])
      set({ jobs, status, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  loadStatus: async () => {
    try {
      const status = await cronApi.status()
      set({ status })
    } catch {}
  },

  loadChannels: async () => {
    try {
      const { channels } = await cronApi.channels()
      set({ channels })
    } catch {}
  },

  addJob: async (job) => {
    set({ busy: true, error: null })
    try {
      await cronApi.add(job)
      await get().loadJobs()
      set({ busy: false })
      return true
    } catch (e: any) {
      set({ error: e.message, busy: false })
      return false
    }
  },

  updateJob: async (id, patch) => {
    set({ busy: true, error: null })
    try {
      await cronApi.update(id, patch)
      await get().loadJobs()
      set({ busy: false })
      return true
    } catch (e: any) {
      set({ error: e.message, busy: false })
      return false
    }
  },

  toggleJob: async (id, enabled) => {
    set({ busy: true, error: null })
    try {
      await cronApi.update(id, { enabled })
      await get().loadJobs()
      set({ busy: false })
      return true
    } catch (e: any) {
      set({ error: e.message, busy: false })
      return false
    }
  },

  removeJob: async (id) => {
    set({ busy: true, error: null })
    try {
      await cronApi.remove(id)
      const state = get()
      if (state.runsJobId === id) {
        set({ runsJobId: null, runs: [] })
      }
      await get().loadJobs()
      set({ busy: false })
      return true
    } catch (e: any) {
      set({ error: e.message, busy: false })
      return false
    }
  },

  runJob: async (id) => {
    set({ busy: true, error: null, runningJobId: id })
    try {
      // Backend returns immediately (fire-and-forget), agent runs in background
      await cronApi.run(id)
      set({ busy: false })

      // Poll until job.state.runningAtMs is cleared (= job finished)
      let pollIdx = 0
      const poll = () => {
        if (pollIdx >= RUN_POLL_INTERVALS.length) {
          // Give up polling — clear running state
          set({ runningJobId: null })
          return
        }
        const delay = RUN_POLL_INTERVALS[pollIdx++]
        setTimeout(async () => {
          const state = get()
          // Another job was triggered or user navigated away
          if (state.runningJobId !== id) return
          await state.loadJobs()
          const job = get().jobs.find(j => j.id === id)
          if (job && !job.state?.runningAtMs) {
            // Job finished — update runs and clear running state
            set({ runningJobId: null })
            await get().loadRuns(id)
          } else {
            poll() // still running, poll again
          }
        }, delay)
      }
      // First poll quickly to pick up runningAtMs being set
      setTimeout(async () => {
        await get().loadJobs()
        poll()
      }, 1000)

      return true
    } catch (e: any) {
      set({ error: e.message, busy: false, runningJobId: null })
      return false
    }
  },

  loadRuns: async (id) => {
    try {
      const { entries } = await cronApi.runs(id)
      set({ runs: entries, runsJobId: id })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  clearError: () => set({ error: null }),
}))
