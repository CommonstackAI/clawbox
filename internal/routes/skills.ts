import { Hono } from 'hono'
import { getConfig } from '../config/index'
import { openclawRpc } from '../providers/openclaw-rpc'
import { createLogger } from '../logger'
import {
  ClawhubAuthActionError,
  ClawhubInstallError,
  ClawhubSearchError,
  getClawhubAuthStatus,
  getClawhubCliStatus,
  installClawhubCli,
  installClawhubSkill,
  loginClawhub,
  loginClawhubInBrowser,
  logoutClawhub,
  searchClawhub,
} from '../skills/clawhub'
import {
  importManualSkill,
  ManualSkillImportError,
  type ManualSkillImportSource,
} from '../skills/manual-import'

const log = createLogger('Skills')

export const skillsRoutes = new Hono()

function getGatewayUrl(): string {
  return getConfig().providers?.openclaw?.baseUrl || ''
}

skillsRoutes.get('/', async (c) => {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }

  try {
    const agentId = c.req.query('agentId')?.trim()
    const result = await openclawRpc(
      gatewayUrl,
      'skills.status',
      agentId ? { agentId } : {},
      30000,
    )
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to load skills status: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.patch('/', async (c) => {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }

  try {
    const body = await c.req.json<{
      skillKey?: string
      enabled?: boolean
      apiKey?: string
      env?: Record<string, string>
    }>()
    const skillKey = body.skillKey?.trim()
    if (!skillKey) {
      return c.json({ error: 'skillKey is required' }, 400)
    }

    const result = await openclawRpc(gatewayUrl, 'skills.update', {
      skillKey,
      ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
      ...(typeof body.apiKey === 'string' ? { apiKey: body.apiKey } : {}),
      ...(body.env && typeof body.env === 'object' ? { env: body.env } : {}),
    })
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to update skill: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/install', async (c) => {
  const gatewayUrl = getGatewayUrl()
  if (!gatewayUrl) {
    return c.json({ error: 'Gateway not configured' }, 400)
  }

  try {
    const body = await c.req.json<{
      name?: string
      installId?: string
      timeoutMs?: number
    }>()
    const name = body.name?.trim()
    const installId = body.installId?.trim()
    const timeoutMs = Number.isFinite(body.timeoutMs) ? Number(body.timeoutMs) : 120000

    if (!name || !installId) {
      return c.json({ error: 'name and installId are required' }, 400)
    }

    const result = await openclawRpc(
      gatewayUrl,
      'skills.install',
      { name, installId, timeoutMs },
      timeoutMs + 15000,
    )
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to install skill dependency: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.get('/market/status', async (c) => {
  try {
    const result = await getClawhubCliStatus()
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to load ClawHub status: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.get('/market/auth/status', async (c) => {
  try {
    const result = await getClawhubAuthStatus()
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to load ClawHub auth status: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/market/cli/install', async (c) => {
  try {
    const body = await c.req.json<{ lang?: string }>().catch(() => null)
    const result = await installClawhubCli(body?.lang)
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to install ClawHub CLI: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/market/auth/login', async (c) => {
  try {
    const body = await c.req.json<{ token?: string; lang?: string }>().catch(() => null)
    const token = body?.token?.trim()
    if (!token) {
      return c.json({ error: 'token is required', code: 'invalid_token' }, 400)
    }

    const result = await loginClawhub({
      token,
      lang: body?.lang,
    })
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to log in to ClawHub: ${error.message}`)
    if (error instanceof ClawhubAuthActionError) {
      return c.json({
        error: error.message,
        code: error.code,
      }, error.code === 'invalid_token' ? 401 : 502)
    }
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/market/auth/login/browser', async (c) => {
  try {
    const body = await c.req.json<{ lang?: string; label?: string }>().catch(() => null)
    const result = await loginClawhubInBrowser({
      lang: body?.lang,
      label: body?.label,
    })
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to start ClawHub browser login: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/market/auth/logout', async (c) => {
  try {
    const body = await c.req.json<{ lang?: string }>().catch(() => null)
    const result = await logoutClawhub(body?.lang)
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to log out from ClawHub: ${error.message}`)
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.get('/market/search', async (c) => {
  try {
    const query = c.req.query('q')?.trim() || ''
    const limitParam = c.req.query('limit')
    const limit = limitParam ? Number(limitParam) : 12
    const result = await searchClawhub(query, limit)
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to search ClawHub: ${error.message}`)
    if (error instanceof ClawhubSearchError) {
      return c.json({
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      }, error.code === 'rate_limit' ? 429 : 502)
    }
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/market/install', async (c) => {
  try {
    const body = await c.req.json<{ slug?: string; version?: string; lang?: string; force?: boolean }>()
    const slug = body.slug?.trim()
    if (!slug) {
      return c.json({ error: 'slug is required' }, 400)
    }

    const result = await installClawhubSkill({
      slug,
      version: body.version,
      lang: body.lang,
      force: body.force === true,
      workspaceDir: getConfig().workspaceDir,
    })
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to install ClawHub skill: ${error.message}`)
    if (error instanceof ClawhubInstallError) {
      return c.json({
        error: error.message,
        code: error.code,
      }, error.code === 'requires_force' ? 409 : 502)
    }
    return c.json({ error: error.message }, 502)
  }
})

skillsRoutes.post('/manual/import', async (c) => {
  try {
    const body = await c.req.json<{
      source?: ManualSkillImportSource
      value?: string
      overwrite?: boolean
    }>()

    if (!body.source || !['directory', 'archive', 'url'].includes(body.source)) {
      return c.json({ error: 'source is required', code: 'invalid_path' }, 400)
    }

    const value = body.value?.trim() || ''
    if (!value) {
      return c.json({ error: 'value is required', code: 'invalid_path' }, 400)
    }

    const result = await importManualSkill({
      source: body.source,
      value,
      overwrite: body.overwrite === true,
      workspaceDir: getConfig().workspaceDir,
    })
    return c.json(result)
  } catch (error: any) {
    log.error(`Failed to manually import skill: ${error.message}`)
    if (error instanceof ManualSkillImportError) {
      return c.json({
        error: error.message,
        code: error.code,
      }, 400)
    }
    return c.json({ error: error.message }, 502)
  }
})
