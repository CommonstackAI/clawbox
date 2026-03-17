import { Hono } from 'hono'
import { getConfig } from '../config/index'
import { openclawRpc } from '../providers/openclaw-rpc'
import { createLogger } from '../logger'

const log = createLogger('Agents')

export const agentRoutes = new Hono()

function getGatewayUrl(): string {
  return getConfig().providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
}

// List agents
agentRoutes.get('/', async (c) => {
  try {
    const result = await openclawRpc(getGatewayUrl(), 'agents.list')
    const agents = (result?.agents ?? []).map((a: any) => ({
      id: a.id,
      name: a.name || a.id,
      default: a.default || false,
      model: a.model || '',
      identity: a.identity,
      skills: a.skills || [],
      toolsEnabled: a.toolsEnabled || [],
    }))
    const defaultAgent = agents.find((a: any) => a.default) || agents[0]
    return c.json({ agents, defaultAgentId: defaultAgent?.id })
  } catch (error: any) {
    log.error(`Failed to list agents: ${error.message}`)
    return c.json({ agents: [], defaultAgentId: null })
  }
})

// Get agent detail
agentRoutes.get('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'agents.list')
    const agent = (result?.agents ?? []).find((a: any) => a.id === id)
    if (!agent) return c.json({ error: 'Agent not found' }, 404)
    return c.json({ config: agent, effectiveConfig: agent })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Create agent
agentRoutes.post('/', async (c) => {
  const body = await c.req.json()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'agents.create', body)
    return c.json({ success: true, agent: result }, 201)
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Update agent
agentRoutes.patch('/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'agents.update', { id, ...body })
    return c.json({ success: true, agent: result })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// Delete agent
agentRoutes.delete('/:id', async (c) => {
  const { id } = c.req.param()
  try {
    await openclawRpc(getGatewayUrl(), 'agents.delete', { id })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})
