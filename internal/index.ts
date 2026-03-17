/**
 * ClawBox Backend Server
 * Bun + Hono on port 13000
 * All agent functionality proxied through OpenClaw gateway
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { chatRoutes } from './routes/chat'
import { sessionRoutes } from './routes/sessions'
import { agentRoutes } from './routes/agents'
import { configRoutes } from './routes/config'
import { modelsRoutes } from './routes/models'
import { titleRoutes } from './routes/titles'
import { toolsRoutes } from './routes/tools'
import { skillsRoutes } from './routes/skills'
import { onboardRoutes, ensureGateway, refreshWindowsPath, killGatewayChildren } from './routes/onboard'
import { channelRoutes } from './routes/channels'
import { cronRoutes } from './routes/cron'
import { soulRoutes } from './routes/soul'

import pkg from '../package.json'
import { loadConfig, getConfig, startConfigWatcher } from './config/index'
import { openclawGetClient } from './providers/openclaw-rpc'
import { createLogger } from './logger'

const rawPort = Number(process.env.CLAWBOX_BACKEND_PORT || '13000')
const PORT = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 13000
const log = createLogger('Server')

const app = new Hono()

// Middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Type'],
}))

// Health & lifecycle endpoints
app.get('/api/health', (c) => {
  const gatewayConnected = openclawGetClient().isConnected()
  return c.json({ status: 'ok', gatewayConnected, timestamp: Date.now() })
})

app.post('/api/shutdown', (c) => {
  log.info('Shutdown requested...')
  setTimeout(async () => {
    try {
      killGatewayChildren()
      if (bunServer) {
        bunServer.stop(true)
        log.info('Server socket closed')
        await new Promise(r => setTimeout(r, 500))
      }
    } catch {}
    process.exit(0)
  }, 200)
  return c.json({ ok: true })
})

app.get('/api/status', (c) => {
  const config = getConfig()
  return c.json({
    healthy: true,
    timestamp: Date.now(),
    gateway: config.providers.openclaw.baseUrl,
    version: pkg.version,
  })
})

// API Routes
app.route('/api/chat', chatRoutes)
app.route('/api/sessions', sessionRoutes)
app.route('/api/agents', agentRoutes)
app.route('/api/config', configRoutes)
app.route('/api/models', modelsRoutes)
app.route('/api/titles', titleRoutes)
app.route('/api/tools', toolsRoutes)
app.route('/api/skills', skillsRoutes)
app.route('/api/onboard', onboardRoutes)
app.route('/api/channels', channelRoutes)
app.route('/api/cron', cronRoutes)
app.route('/api/soul', soulRoutes)

// Error handling
app.onError((err, c) => {
  log.error(`Unhandled error: ${err.message}`)
  return c.json({ error: err.message }, 500)
})

app.notFound((c) => c.json({ error: 'Not found' }, 404))

// Initialization
async function initializeServer(): Promise<void> {
  loadConfig()
  startConfigWatcher()

  if (process.platform === 'win32') {
    await refreshWindowsPath()
  }

  const config = getConfig()

  ensureGateway().catch((e) => {
    log.warn(`Gateway auto-start failed: ${e.message}`)
  })

  log.info(`Server started on port ${PORT}`)
}

await initializeServer()

const bunServer = (globalThis as any).Bun.serve({
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 255,
  reusePort: true,
})
log.info(`Bun server listening on port ${bunServer.port}`)

function gracefulShutdown() {
  try {
    killGatewayChildren()
    bunServer.stop(true)
  } catch {}
  process.exit(0)
}
process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)
process.on('SIGBREAK', gracefulShutdown)
