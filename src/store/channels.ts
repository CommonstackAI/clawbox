import { create } from 'zustand'
import { channelsApi, channelsFacadeApi } from '@/services/api'
import { trackExpectedGatewayRestart } from '@/store/gateway-restart'
import { useSettingsStore } from '@/store/settings'
import type {
  ChannelAccountSnapshot,
  ChannelAuthSession,
  ChannelCatalogItem,
  ChannelDetailPayload,
  ChannelSectionKey,
  ChannelSummary,
  PairingRequest,
} from '@/types'

type LegacyChannelState = {
  label: string
  accounts: ChannelAccountSnapshot[]
  defaultAccountId?: string
  config: Record<string, any> | null
}

type ChannelFilters = {
  query: string
  mode: 'all' | 'loaded' | 'installable'
}

type ChannelOpState = {
  pending: boolean
  error?: string | null
}

interface ChannelsStore {
  // New dynamic platform state
  catalogById: Record<string, ChannelCatalogItem>
  orderedIds: string[]
  summariesById: Record<string, ChannelSummary>
  detailsById: Record<string, ChannelDetailPayload | undefined>
  authSessionsByChannel: Record<string, ChannelAuthSession | undefined>
  selectedChannelId: string | null
  selectedTab: ChannelSectionKey
  filters: ChannelFilters
  loadingCatalog: boolean
  loadingList: boolean
  listHydrated: boolean
  loadingDetailById: Record<string, boolean>
  globalError: string | null
  gatewayError: string | null
  opStateByKey: Record<string, ChannelOpState>

  // Legacy compatibility state for Telegram/Slack/Feishu panels
  channels: Record<string, LegacyChannelState>
  loading: boolean
  configLoading: boolean
  error: string | null
  lastStatusTs: number | null
  pairingRequests: Record<string, PairingRequest[]>
  allowFromList: Record<string, string[]>
  pairingLoading: boolean
  probing: boolean
  toggling: Record<string, boolean>

  // New platform actions
  fetchCatalog: () => Promise<void>
  fetchList: () => Promise<void>
  refreshAll: () => Promise<void>
  fetchDetail: (channelId: string, force?: boolean) => Promise<void>
  probeChannel: (channelId: string) => Promise<void>
  activateChannel: (channelId: string) => Promise<void>
  enableChannel: (channelId: string, accountId?: string) => Promise<void>
  disableChannel: (channelId: string, accountId?: string) => Promise<void>
  startAuthSession: (channelId: string, options?: { accountId?: string; force?: boolean }) => Promise<void>
  pollAuthSession: (channelId: string) => Promise<void>
  cancelAuthSession: (channelId: string) => Promise<void>
  openChannel: (channelId: string) => void
  closeChannel: () => void
  selectTab: (tab: ChannelSectionKey) => void
  setQuery: (query: string) => void
  setMode: (mode: ChannelFilters['mode']) => void

  // Legacy actions
  fetchStatus: (probe?: boolean) => Promise<void>
  fetchChannelConfig: (channelId: string) => Promise<void>
  updateChannelConfig: (channelId: string, patch: Record<string, any>) => Promise<void>
  logoutChannel: (channelId: string, accountId?: string) => Promise<void>
  toggleChannelEnabled: (channelId: string, enabled: boolean) => Promise<void>
  probeChannels: () => Promise<void>
  fetchPairing: (channelId: string) => Promise<void>
  approvePairing: (channelId: string, code: string) => Promise<void>
  fetchAllowFrom: (channelId: string) => Promise<void>
}

const emptyLegacyChannelState = (): LegacyChannelState => ({
  label: '',
  accounts: [],
  config: null,
})

function buildOrderedIds(catalogById: Record<string, ChannelCatalogItem>, summariesById: Record<string, ChannelSummary>): string[] {
  const ids = new Set<string>([
    ...Object.keys(catalogById),
    ...Object.keys(summariesById),
  ])

  return [...ids].sort((a, b) => {
    const summaryA = summariesById[a]
    const summaryB = summariesById[b]
    if (Boolean(summaryA?.loaded) !== Boolean(summaryB?.loaded)) {
      return summaryA?.loaded ? -1 : 1
    }
    const orderA = catalogById[a]?.order ?? 999
    const orderB = catalogById[b]?.order ?? 999
    if (orderA !== orderB) return orderA - orderB
    const labelA = summaryA?.label || catalogById[a]?.label || a
    const labelB = summaryB?.label || catalogById[b]?.label || b
    return labelA.localeCompare(labelB)
  })
}

function syncLegacyChannels(
  current: Record<string, LegacyChannelState>,
  summariesById: Record<string, ChannelSummary>,
): Record<string, LegacyChannelState> {
  const next = { ...current }
  for (const summary of Object.values(summariesById)) {
    const existing = next[summary.id] ?? emptyLegacyChannelState()
    next[summary.id] = {
      ...existing,
      label: summary.label,
      accounts: summary.accounts,
      defaultAccountId: summary.defaultAccountId,
    }
  }
  return next
}

function setOpPending(
  current: Record<string, ChannelOpState>,
  key: string,
  pending: boolean,
  error: string | null = null,
): Record<string, ChannelOpState> {
  return {
    ...current,
    [key]: {
      pending,
      ...(error ? { error } : {}),
    },
  }
}

let statusPromise: Promise<void> | null = null

export const useChannelsStore = create<ChannelsStore>((set, get) => ({
  catalogById: {},
  orderedIds: [],
  summariesById: {},
  detailsById: {},
  authSessionsByChannel: {},
  selectedChannelId: null,
  selectedTab: 'overview',
  filters: { query: '', mode: 'all' },
  loadingCatalog: false,
  loadingList: false,
  listHydrated: false,
  loadingDetailById: {},
  globalError: null,
  gatewayError: null,
  opStateByKey: {},

  channels: {},
  loading: false,
  configLoading: false,
  error: null,
  lastStatusTs: null,
  pairingRequests: {},
  allowFromList: {},
  pairingLoading: false,
  probing: false,
  toggling: {},

  fetchCatalog: async () => {
    try {
      set({ loadingCatalog: true, globalError: null })
      const { items } = await channelsFacadeApi.catalog()
      const catalogById = items.reduce<Record<string, ChannelCatalogItem>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {})
      set({
        catalogById,
        orderedIds: buildOrderedIds(catalogById, get().summariesById),
        loadingCatalog: false,
      })
    } catch (e: any) {
      set({ loadingCatalog: false, globalError: e.message })
    }
  },

  fetchList: async () => {
    try {
      set({ loadingList: true, globalError: null })
      const { items, gatewayError } = await channelsFacadeApi.list()
      const summariesById = items.reduce<Record<string, ChannelSummary>>((acc, item) => {
        acc[item.id] = item
        return acc
      }, {})

      set((state) => ({
        summariesById,
        gatewayError: gatewayError || null,
        orderedIds: buildOrderedIds(state.catalogById, summariesById),
        channels: syncLegacyChannels(state.channels, summariesById),
        listHydrated: true,
        loadingList: false,
      }))
    } catch (e: any) {
      set((state) => ({
        listHydrated: true,
        loadingList: false,
        globalError: e.message,
        orderedIds: buildOrderedIds(state.catalogById, state.summariesById),
      }))
    }
  },

  refreshAll: async () => {
    await get().fetchCatalog()
    await get().fetchList()
  },

  fetchDetail: async (channelId, force = false) => {
    if (!force && get().detailsById[channelId]) return
    set((state) => ({
      loadingDetailById: { ...state.loadingDetailById, [channelId]: true },
    }))
    try {
      const detail = await channelsFacadeApi.detail(channelId)
      set((state) => ({
        summariesById: {
          ...state.summariesById,
          [channelId]: detail.summary,
        },
        detailsById: { ...state.detailsById, [channelId]: detail },
        channels: {
          ...state.channels,
          [channelId]: {
            ...(state.channels[channelId] ?? emptyLegacyChannelState()),
            label: detail.summary.label,
            accounts: detail.summary.accounts,
            defaultAccountId: detail.summary.defaultAccountId,
            config: detail.config as Record<string, any> | null,
          },
        },
        pairingRequests: {
          ...state.pairingRequests,
          [channelId]: detail.pairing.pending,
        },
        allowFromList: {
          ...state.allowFromList,
          [channelId]: detail.pairing.allowFrom,
        },
        loadingDetailById: { ...state.loadingDetailById, [channelId]: false },
      }))
    } catch (e: any) {
      set((state) => ({
        loadingDetailById: { ...state.loadingDetailById, [channelId]: false },
        globalError: e.message,
      }))
    }
  },

  probeChannel: async (channelId) => {
    const opKey = `probe:${channelId}`
    set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, true) }))
    try {
      await channelsFacadeApi.probe(channelId)
      await get().fetchList()
      await get().fetchDetail(channelId, true)
      set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, false) }))
    } catch (e: any) {
      set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message) }))
      throw e
    }
  },

  activateChannel: async (channelId) => {
    const opKey = `activate:${channelId}`
    set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, true) }))
    try {
      await channelsFacadeApi.activate(channelId)
      await get().fetchList()
      await get().fetchDetail(channelId, true)
      set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, false) }))
    } catch (e: any) {
      set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message) }))
      throw e
    }
  },

  enableChannel: async (channelId, accountId) => {
    const opKey = `enable:${channelId}`
    const gatewayUrl = useSettingsStore.getState().getGatewayUrl()
    const resolveGatewayUrl = () => useSettingsStore.getState().getGatewayUrl()
    set((state) => ({
      opStateByKey: setOpPending(state.opStateByKey, opKey, true),
      toggling: { ...state.toggling, [channelId]: true },
    }))
    try {
      const restartTracker = trackExpectedGatewayRestart(gatewayUrl, 'channel-toggle', resolveGatewayUrl)
      await channelsFacadeApi.enable(channelId, accountId)
      await restartTracker
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await get().fetchList()
      }
      await get().fetchDetail(channelId, true)
      set((state) => ({
        opStateByKey: setOpPending(state.opStateByKey, opKey, false),
        toggling: { ...state.toggling, [channelId]: false },
      }))
    } catch (e: any) {
      set((state) => ({
        opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message),
        toggling: { ...state.toggling, [channelId]: false },
      }))
      throw e
    }
  },

  disableChannel: async (channelId, accountId) => {
    const opKey = `disable:${channelId}`
    const gatewayUrl = useSettingsStore.getState().getGatewayUrl()
    const resolveGatewayUrl = () => useSettingsStore.getState().getGatewayUrl()
    set((state) => ({
      opStateByKey: setOpPending(state.opStateByKey, opKey, true),
      toggling: { ...state.toggling, [channelId]: true },
    }))
    try {
      const restartTracker = trackExpectedGatewayRestart(gatewayUrl, 'channel-toggle', resolveGatewayUrl)
      await channelsFacadeApi.disable(channelId, accountId)
      await restartTracker
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await get().fetchList()
      }
      await get().fetchDetail(channelId, true)
      set((state) => ({
        opStateByKey: setOpPending(state.opStateByKey, opKey, false),
        toggling: { ...state.toggling, [channelId]: false },
      }))
    } catch (e: any) {
      set((state) => ({
        opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message),
        toggling: { ...state.toggling, [channelId]: false },
      }))
      throw e
    }
  },

  startAuthSession: async (channelId, options) => {
    const opKey = `auth-start:${channelId}`
    set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, true) }))
    try {
      const session = await channelsFacadeApi.startAuth(channelId, {
        accountId: options?.accountId,
        force: options?.force,
        timeoutMs: 30000,
      })
      set((state) => ({
        authSessionsByChannel: { ...state.authSessionsByChannel, [channelId]: session },
        opStateByKey: setOpPending(state.opStateByKey, opKey, false),
      }))
    } catch (e: any) {
      set((state) => ({
        authSessionsByChannel: {
          ...state.authSessionsByChannel,
          [channelId]: state.authSessionsByChannel[channelId]
            ? {
                ...state.authSessionsByChannel[channelId]!,
                state: 'error',
                error: e.message,
                message: e.message,
              }
            : {
                sessionId: `local-${channelId}`,
                channelId,
                state: 'error',
                message: e.message,
                error: e.message,
                startedAt: Date.now(),
                updatedAt: Date.now(),
                expiresAt: Date.now() + 5 * 60 * 1000,
              },
        },
        opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message),
      }))
      throw e
    }
  },

  pollAuthSession: async (channelId) => {
    const session = get().authSessionsByChannel[channelId]
    if (!session) return
    if (session.state === 'connected' || session.state === 'error' || session.state === 'cancelled') return
    try {
      const next = await channelsFacadeApi.pollAuth(channelId, session.sessionId)
      set((state) => ({
        authSessionsByChannel: { ...state.authSessionsByChannel, [channelId]: next },
      }))
      if (next.state === 'connected') {
        await get().fetchList()
        await get().fetchDetail(channelId, true)
      }
    } catch (e: any) {
      set((state) => ({
        authSessionsByChannel: {
          ...state.authSessionsByChannel,
          [channelId]: session ? { ...session, state: 'error', error: e.message, message: e.message } : session,
        },
      }))
    }
  },

  cancelAuthSession: async (channelId) => {
    const session = get().authSessionsByChannel[channelId]
    if (!session) return
    try {
      const next = await channelsFacadeApi.cancelAuth(channelId, session.sessionId)
      set((state) => ({
        authSessionsByChannel: { ...state.authSessionsByChannel, [channelId]: next },
      }))
    } catch (e: any) {
      set((state) => ({
        authSessionsByChannel: {
          ...state.authSessionsByChannel,
          [channelId]: { ...session, state: 'error', error: e.message, message: e.message },
        },
      }))
    }
  },

  openChannel: (channelId) => {
    set({ selectedChannelId: channelId, selectedTab: 'overview' })
  },

  closeChannel: () => {
    set({ selectedChannelId: null, selectedTab: 'overview' })
  },

  selectTab: (tab) => set({ selectedTab: tab }),

  setQuery: (query) => set((state) => ({ filters: { ...state.filters, query } })),

  setMode: (mode) => set((state) => ({ filters: { ...state.filters, mode } })),

  fetchStatus: async (probe = false) => {
    if (!probe && statusPromise) return statusPromise

    const doFetch = async () => {
      try {
        set({ loading: true, error: null })
        const result = await channelsApi.status(probe)
        set((state) => ({
          channels: syncLegacyChannels(
            state.channels,
            Object.values(result.channelAccounts || {}).reduce<Record<string, ChannelSummary>>((acc, accounts, index) => {
              const id = result.channelOrder?.[index] || Object.keys(result.channelAccounts || {})[index]
              if (!id) return acc
              acc[id] = {
                id,
                label: result.channelLabels?.[id] || id,
                detailLabel: result.channelDetailLabels?.[id],
                description: state.catalogById[id]?.description || '',
                source: state.catalogById[id]?.source || 'extension',
                known: Boolean(state.catalogById[id]),
                loaded: true,
                installable: false,
                configured: accounts.some((account) => account.configured === true),
                enabled: accounts.some((account) => account.enabled !== false),
                running: accounts.some((account) => account.running === true || account.connected === true),
                connected: accounts.some((account) => account.connected === true),
                health: 'idle',
                defaultAccountId: result.channelDefaultAccountId?.[id],
                accountCount: accounts.length,
                accounts,
                capabilities: state.catalogById[id]?.capabilities ?? {
                  threads: false,
                  media: false,
                  reactions: false,
                  polls: false,
                  nativeCommands: false,
                  blockStreaming: false,
                  multiAccount: false,
                },
                actions: state.catalogById[id] ? {
                  canView: true,
                  canConfigure: true,
                  canProbe: true,
                  canEnable: true,
                  canDisable: true,
                  canLogout: true,
                  canPairing: Boolean(state.catalogById[id]?.defaults.supportsPairing),
                  canAuth: Boolean(state.catalogById[id]?.defaults.supportsAuthFlow),
                  canManageAccounts: Boolean(state.catalogById[id]?.capabilities.multiAccount),
                } : {
                  canView: true,
                  canConfigure: true,
                  canProbe: true,
                  canEnable: true,
                  canDisable: true,
                  canLogout: false,
                  canPairing: false,
                  canAuth: false,
                  canManageAccounts: false,
                },
                lastError: accounts.find((account) => typeof account.lastError === 'string')?.lastError,
              }
              return acc
            }, {}),
          ),
          loading: false,
          lastStatusTs: result.ts,
        }))
      } catch (e: any) {
        set({ loading: false, error: e.message })
      }
    }

    if (!probe) {
      statusPromise = doFetch().finally(() => { statusPromise = null })
      return statusPromise
    }
    return doFetch()
  },

  fetchChannelConfig: async (channelId) => {
    try {
      set({ configLoading: true })
      const { config } = await channelsApi.getConfig(channelId)
      set((state) => ({
        channels: {
          ...state.channels,
          [channelId]: {
            ...(state.channels[channelId] ?? emptyLegacyChannelState()),
            config,
          },
        },
        detailsById: state.detailsById[channelId]
          ? {
              ...state.detailsById,
              [channelId]: {
                ...state.detailsById[channelId]!,
                config,
                diagnostics: {
                  ...state.detailsById[channelId]!.diagnostics,
                  rawConfig: config,
                },
              },
            }
          : state.detailsById,
        configLoading: false,
      }))
    } catch (e: any) {
      set({ configLoading: false, error: e.message })
    }
  },

  updateChannelConfig: async (channelId, patch) => {
    try {
      const gatewayUrl = useSettingsStore.getState().getGatewayUrl()
      const resolveGatewayUrl = () => useSettingsStore.getState().getGatewayUrl()
      const restartTracker = trackExpectedGatewayRestart(gatewayUrl, 'channel-config', resolveGatewayUrl)
      await channelsApi.updateConfig(channelId, patch)
      await restartTracker
      await get().fetchChannelConfig(channelId)
      await get().fetchStatus()
      await get().fetchList()
      await get().fetchDetail(channelId, true)
    } catch (e: any) {
      set({ error: e.message })
      throw e
    }
  },

  logoutChannel: async (channelId, accountId) => {
    const opKey = `logout:${channelId}`
    set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, true) }))
    try {
      await channelsFacadeApi.logout(channelId, accountId)
      await get().fetchList()
      await get().fetchDetail(channelId, true)
      set((state) => ({ opStateByKey: setOpPending(state.opStateByKey, opKey, false) }))
    } catch (e: any) {
      set((state) => ({
        error: e.message,
        opStateByKey: setOpPending(state.opStateByKey, opKey, false, e.message),
      }))
      throw e
    }
  },

  toggleChannelEnabled: async (channelId, enabled) => {
    if (enabled) {
      await get().enableChannel(channelId)
      return
    }
    await get().disableChannel(channelId)
  },

  probeChannels: async () => {
    set({ probing: true })
    try {
      await get().fetchStatus(true)
    } finally {
      set({ probing: false })
    }
  },

  fetchPairing: async (channelId) => {
    try {
      set({ pairingLoading: true })
      const { requests } = await channelsApi.pairingRequests(channelId)
      set((state) => ({
        pairingRequests: { ...state.pairingRequests, [channelId]: requests },
        pairingLoading: false,
      }))
    } catch {
      set({ pairingLoading: false })
    }
  },

  approvePairing: async (channelId, code) => {
    await channelsApi.approvePairing(channelId, code)
    await get().fetchPairing(channelId)
    await get().fetchAllowFrom(channelId)
    await get().fetchDetail(channelId, true)
  },

  fetchAllowFrom: async (channelId) => {
    try {
      const { allowFrom } = await channelsApi.allowFrom(channelId)
      set((state) => ({
        allowFromList: { ...state.allowFromList, [channelId]: allowFrom },
      }))
    } catch {}
  },
}))
