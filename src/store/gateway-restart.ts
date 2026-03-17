import { create } from 'zustand'
import { healthApi } from '@/services/api'

export type GatewayRestartPhase = 'idle' | 'restarting' | 'delayed'
export type GatewayRestartSource =
  | 'settings-provider'
  | 'settings-model'
  | 'chat-model'
  | 'channel-config'
  | 'channel-toggle'

interface GatewayRestartState {
  phase: GatewayRestartPhase
  source: GatewayRestartSource | null
  gatewayUrl: string | null
  startedAt: number | null
  visible: boolean
  trackExpectedRestart: (params: {
    gatewayUrl: string
    source: GatewayRestartSource
    resolveGatewayUrl?: () => string
  }) => Promise<void>
  dismiss: () => void
}

const FAST_POLL_MS = 2000
const SLOW_POLL_MS = 5000
const DELAYED_AFTER_MS = 60000
const MIN_VISIBLE_MS = 4000
const HIDE_DELAY_MS = 1500

const idleState = {
  phase: 'idle' as const,
  source: null,
  gatewayUrl: null,
  startedAt: null,
  visible: false,
}

let activeRunId = 0
let hideTimer: number | null = null

function clearHideTimer(): void {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export const useGatewayRestartStore = create<GatewayRestartState>((set, get) => ({
  ...idleState,

  trackExpectedRestart: async ({ gatewayUrl, source, resolveGatewayUrl }) => {
    if (!gatewayUrl) return

    activeRunId += 1
    const runId = activeRunId
    const startedAt = Date.now()
    let observedDisconnect = false

    clearHideTimer()
    set({
      phase: 'restarting',
      source,
      gatewayUrl,
      startedAt,
      visible: true,
    })

    while (activeRunId === runId) {
      const elapsed = Date.now() - startedAt
      const nextGatewayUrl = resolveGatewayUrl?.() || gatewayUrl
      if (get().gatewayUrl !== nextGatewayUrl) {
        set({ gatewayUrl: nextGatewayUrl })
      }
      const gatewayHealthy = await healthApi.checkGateway(nextGatewayUrl)

      if (activeRunId !== runId) return

      if (!gatewayHealthy) {
        observedDisconnect = true
      }

      const nextPhase = elapsed >= DELAYED_AFTER_MS ? 'delayed' : 'restarting'
      if (get().phase !== nextPhase) {
        set({ phase: nextPhase })
      }

      if (gatewayHealthy && (observedDisconnect || elapsed >= MIN_VISIBLE_MS)) {
        hideTimer = window.setTimeout(() => {
          if (activeRunId !== runId) return
          set({ ...idleState })
          hideTimer = null
        }, HIDE_DELAY_MS)
        return
      }

      await sleep(elapsed >= DELAYED_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS)
    }
  },

  dismiss: () => {
    activeRunId += 1
    clearHideTimer()
    set({ ...idleState })
  },
}))

export function trackExpectedGatewayRestart(
  gatewayUrl: string,
  source: GatewayRestartSource,
  resolveGatewayUrl?: () => string,
): Promise<void> {
  return useGatewayRestartStore.getState().trackExpectedRestart({ gatewayUrl, source, resolveGatewayUrl })
}
