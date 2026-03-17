import { Hono } from 'hono'
import { getConfig } from '../config/index'
import { openclawRpc } from '../providers/openclaw-rpc'
import { createLogger } from '../logger'
import { listChannelsFacade } from '../channels/facade'

const log = createLogger('Cron')

export const cronRoutes = new Hono()

function getGatewayUrl(): string {
  return getConfig().providers.openclaw.baseUrl || 'http://127.0.0.1:18789/v1'
}

// Get available delivery channels from the unified channels facade
cronRoutes.get('/channels', async (c) => {
  const channels: { id: string; label: string }[] = [
    { id: 'last', label: '最近活跃渠道（自动）' },
  ]
  try {
    const result = await listChannelsFacade()
    for (const channel of result.items) {
      if (!channel.loaded || !channel.configured) continue
      channels.push({ id: channel.id, label: channel.label })
    }
  } catch (err: any) {
    log.warn(`Failed to fetch channels facade data: ${err.message}`)
  }
  return c.json({ channels })
})

// Get cron service status
cronRoutes.get('/status', async (c) => {
  try {
    const result = await openclawRpc(getGatewayUrl(), 'cron.status', {})
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to get cron status: ${error.message}`)
    return c.json({ enabled: false, jobs: 0 })
  }
})

// List all cron jobs
cronRoutes.get('/jobs', async (c) => {
  try {
    const result = await openclawRpc(getGatewayUrl(), 'cron.list', { includeDisabled: true })
    return c.json({ jobs: result?.jobs ?? [] })
  } catch (error: any) {
    log.error(`Failed to list cron jobs: ${error.message}`)
    return c.json({ jobs: [] })
  }
})

// Add a cron job
cronRoutes.post('/jobs', async (c) => {
  const body = await c.req.json()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'cron.add', body)
    return c.json({ success: true, ...result })
  } catch (error: any) {
    log.error(`Failed to add cron job: ${error.message}`)
    return c.json({ error: error.message }, 500)
  }
})

// Update a cron job
cronRoutes.patch('/jobs/:id', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'cron.update', { id, patch: body })
    return c.json({ success: true, ...result })
  } catch (error: any) {
    log.error(`Failed to update cron job: ${error.message}`)
    return c.json({ error: error.message }, 500)
  }
})

// Remove a cron job
cronRoutes.delete('/jobs/:id', async (c) => {
  const { id } = c.req.param()
  try {
    await openclawRpc(getGatewayUrl(), 'cron.remove', { id })
    return c.json({ success: true })
  } catch (error: any) {
    log.error(`Failed to remove cron job: ${error.message}`)
    return c.json({ error: error.message }, 500)
  }
})

// Manually run a cron job
// cron.run is synchronous on the gateway side — it awaits the full agent execution
// before responding. This can take minutes, so we fire-and-forget: respond to the
// HTTP client immediately and let the RPC complete in the background.
cronRoutes.post('/jobs/:id/run', async (c) => {
  const { id } = c.req.param()
  // Fire the RPC in the background (5 min timeout for the agent to finish)
  openclawRpc(getGatewayUrl(), 'cron.run', { id, mode: 'force' }, 300_000)
    .then(() => log.info(`Cron job ${id} completed`))
    .catch((err: any) => log.warn(`Cron job ${id} run failed: ${err.message}`))
  // Respond immediately
  return c.json({ success: true, triggered: true })
})

// Get run history for a cron job
cronRoutes.get('/jobs/:id/runs', async (c) => {
  const { id } = c.req.param()
  try {
    const result = await openclawRpc(getGatewayUrl(), 'cron.runs', { id, limit: 50 })
    return c.json({ entries: result?.entries ?? [] })
  } catch (error: any) {
    log.error(`Failed to get cron runs: ${error.message}`)
    return c.json({ entries: [] })
  }
})
