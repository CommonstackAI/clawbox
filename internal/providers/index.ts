import { openclawListModels } from './openclaw-rpc'

export interface ProviderAdapter {
  name: string
  getProviderConfig(): { provider: string; apiKey: string; baseUrl?: string }
  listModels(): Promise<string[]>
}

export function createOpenClawProvider(config: { apiKey: string; baseUrl?: string }): ProviderAdapter {
  const baseUrl = config.baseUrl || 'http://127.0.0.1:18789/v1'
  return {
    name: 'openclaw',
    getProviderConfig() {
      return { provider: 'openclaw', apiKey: config.apiKey, baseUrl }
    },
    async listModels(): Promise<string[]> {
      try {
        return await openclawListModels(baseUrl)
      } catch {
        return []
      }
    },
  }
}
