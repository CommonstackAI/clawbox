import { create } from 'zustand'
import { configApi, openclawApi, healthApi } from '@/services/api'
import { trackExpectedGatewayRestart } from '@/store/gateway-restart'
import type { ClawboxConfig } from '@/types'
import {
  buildModelRef,
  getActiveUpstreamProviderId,
  inferUpstreamProviderType,
  getModelRefProviderId,
} from '@/lib/provider-config'

interface SettingsState {
  config: ClawboxConfig | null
  isLoading: boolean
  models: string[]
  pendingModel: string | null
  loadConfig: () => Promise<void>
  updateConfig: (patch: Partial<ClawboxConfig>) => Promise<void>
  getGatewayUrl: () => string
  fetchModels: () => Promise<void>
  switchModel: (model: string) => Promise<void>
  selectModel: (model: string) => void
  applyPendingModel: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  isLoading: false,
  models: [],
  pendingModel: null,

  loadConfig: async () => {
    set({ isLoading: true })
    try {
      const { config } = await configApi.get()
      set({ config, isLoading: false })
    } catch (e) {
      console.error('Failed to load config:', e)
      set({ isLoading: false })
    }
  },

  updateConfig: async (patch) => {
    try {
      const { config } = await configApi.patch(patch)
      set({ config })
    } catch (e) {
      console.error('Failed to update config:', e)
    }
  },

  getGatewayUrl: () => {
    const { config } = get()
    return config?.providers?.openclaw?.baseUrl || 'http://127.0.0.1:18789/v1'
  },

  fetchModels: async () => {
    const gatewayUrl = get().getGatewayUrl()
    try {
      const result = await openclawApi.check(gatewayUrl)
      if (result.ok) {
        const { config } = get()
        const activeProviderId =
          result.config?.activeProviderId || getActiveUpstreamProviderId(config)
        const modelRefs = (result.models || [])
          .map((m: any) => {
            if (typeof m === 'string') {
              return m
            }
            const providerId = typeof m?.provider === 'string' ? m.provider.trim() : ''
            const modelId = typeof m?.id === 'string' ? m.id.trim() : ''
            if (!providerId || !modelId) {
              return null
            }
            return buildModelRef(providerId, modelId)
          })
          .filter((value: string | null): value is string => Boolean(value))
          .filter((modelRef: string) => {
            const providerId = getModelRefProviderId(modelRef)
            return activeProviderId ? providerId === activeProviderId : true
          })
        set({ models: modelRefs })

        if (config && result.config?.defaultModel) {
          const nextProviderType = inferUpstreamProviderType(result.config.activeProviderId)
          const nextConfig: ClawboxConfig = {
            ...config,
            providers: {
              ...config.providers,
              openclaw: {
                ...config.providers.openclaw,
                models: modelRefs,
                defaultModel: result.config.defaultModel,
                upstream: {
                  ...config.providers.openclaw.upstream,
                  active: nextProviderType,
                  commonstack: {
                    ...config.providers.openclaw.upstream.commonstack,
                    baseUrl: result.config.activeProviderId === 'commonstack'
                      ? (result.config.activeProviderBaseUrl || config.providers.openclaw.upstream.commonstack.baseUrl)
                      : config.providers.openclaw.upstream.commonstack.baseUrl,
                  },
                  custom: {
                    ...config.providers.openclaw.upstream.custom,
                    baseUrl: nextProviderType === 'custom'
                      ? (result.config.activeProviderBaseUrl || config.providers.openclaw.upstream.custom.baseUrl)
                      : config.providers.openclaw.upstream.custom.baseUrl,
                    providerId: nextProviderType === 'custom'
                      ? (result.config.activeProviderId || config.providers.openclaw.upstream.custom.providerId)
                      : config.providers.openclaw.upstream.custom.providerId,
                  },
                },
              },
            },
          }
          const changed =
            nextConfig.providers.openclaw.defaultModel !== config.providers.openclaw.defaultModel ||
            nextConfig.providers.openclaw.upstream.active !== config.providers.openclaw.upstream.active ||
            nextConfig.providers.openclaw.upstream.commonstack.baseUrl !== config.providers.openclaw.upstream.commonstack.baseUrl ||
            nextConfig.providers.openclaw.upstream.custom.baseUrl !== config.providers.openclaw.upstream.custom.baseUrl ||
            nextConfig.providers.openclaw.upstream.custom.providerId !== config.providers.openclaw.upstream.custom.providerId
          if (changed) {
            set({ config: nextConfig })
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch models:', e)
    }
  },

  switchModel: async (model: string) => {
    const { config, getGatewayUrl } = get()
    if (!config) return
    const gatewayUrl = getGatewayUrl()
    const resolveGatewayUrl = () => get().getGatewayUrl()
    set({
      config: {
        ...config,
        providers: {
          ...config.providers,
          openclaw: { ...config.providers.openclaw, defaultModel: model },
        },
      },
    })
    // Update gateway config — may trigger gateway restart, which is expected
    void trackExpectedGatewayRestart(gatewayUrl, 'settings-model', resolveGatewayUrl)
    try {
      await openclawApi.patchConfig(gatewayUrl, {
        agents: { defaults: { model: { primary: model } } },
      })
    } catch (e) {
      // Gateway restarts after config.patch, causing connection drop — this is normal
      console.info('Gateway config patch completed (gateway may have restarted):', e)
    }
  },

  selectModel: (model: string) => {
    const { config } = get()
    if (!config) return
    // Update local config immediately so UI reflects the change
    set({
      pendingModel: model,
      config: {
        ...config,
        providers: {
          ...config.providers,
          openclaw: { ...config.providers.openclaw, defaultModel: model },
        },
      },
    })
  },

  applyPendingModel: async () => {
    const { pendingModel, config, getGatewayUrl } = get()
    if (!pendingModel || !config) return
    const gatewayUrl = getGatewayUrl()
    const resolveGatewayUrl = () => get().getGatewayUrl()
    set({
      config: {
        ...config,
        providers: {
          ...config.providers,
          openclaw: { ...config.providers.openclaw, defaultModel: pendingModel },
        },
      },
    })
    // Patch gateway config — may trigger restart
    void trackExpectedGatewayRestart(gatewayUrl, 'chat-model', resolveGatewayUrl)
    try {
      await openclawApi.patchConfig(gatewayUrl, {
        agents: { defaults: { model: { primary: pendingModel } } },
      })
    } catch (e) {
      console.info('Gateway config patch completed (gateway may have restarted):', e)
    }
    // Wait for gateway to come back
    await new Promise(r => setTimeout(r, 3000))
    const maxWaitMs = 60000
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      const ok = await healthApi.checkGateway(gatewayUrl)
      if (ok) break
      await new Promise(r => setTimeout(r, 2000))
    }
    await get().loadConfig()
    await get().fetchModels()
    set({ pendingModel: null })
  },
}))
