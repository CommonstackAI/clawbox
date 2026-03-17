import { Hono } from 'hono'
import { getConfig } from '../config/index'
import { openclawRpc } from '../providers/openclaw-rpc'

export const modelsRoutes = new Hono()

// List available models from gateway
modelsRoutes.get('/', async (c) => {
  const gatewayUrl = getConfig().providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
  try {
    const result = await openclawRpc(gatewayUrl, 'models.list')
    return c.json({ models: result?.models ?? [] })
  } catch (error: any) {
    return c.json({ models: [], error: error.message })
  }
})
