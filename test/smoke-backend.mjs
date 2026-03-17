#!/usr/bin/env node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import net from 'node:net'

const root = resolve(process.cwd())

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate free port'))
        return
      }
      const { port } = address
      server.close(() => resolvePort(port))
    })
    server.on('error', reject)
  })
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms))
}

async function waitForHttp(url, timeoutMs = 10000) {
  const startedAt = Date.now()
  let lastError = null
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
      lastError = new Error(`Unexpected status ${res.status}`)
    } catch (error) {
      lastError = error
    }
    await wait(250)
  }
  throw lastError || new Error(`Timed out waiting for ${url}`)
}

function createProcessLogger(name, child) {
  const chunks = { stdout: [], stderr: [] }

  child.stdout?.on('data', (data) => {
    chunks.stdout.push(String(data))
  })
  child.stderr?.on('data', (data) => {
    chunks.stderr.push(String(data))
  })

  child.on('exit', (code) => {
    if (code !== 0) console.error(`[${name}] exited with code ${code}`)
  })

  return () => ({
    stdout: chunks.stdout.join(''),
    stderr: chunks.stderr.join(''),
  })
}

async function parseSse(response) {
  const text = await response.text()
  return text
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const event = chunk.match(/^event:\s*(.+)$/m)?.[1]?.trim() || ''
      const dataLine = chunk.match(/^data:\s*(.+)$/m)?.[1]?.trim() || '{}'
      return {
        event,
        data: JSON.parse(dataLine),
      }
    })
}

async function main() {
  const mockPort = await getFreePort()
  const backendPort = await getFreePort()
  const tempHome = mkdtempSync(join(tmpdir(), 'clawbox-smoke-'))
  const gatewayUrl = `http://127.0.0.1:${mockPort}/v1`
  const backendUrl = `http://127.0.0.1:${backendPort}`
  const backendEnv = {
    ...process.env,
    HOME: tempHome,
    CLAWBOX_HOME: join(tempHome, '.clawbox'),
    OPENCLAW_GATEWAY_URL: gatewayUrl,
    CLAWBOX_BACKEND_PORT: String(backendPort),
  }

  const mock = spawn('node', ['scripts/mock-gateway.mjs', '--port', String(mockPort)], {
    cwd: root,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const mockLogs = createProcessLogger('mock-gateway', mock)

  const backend = spawn('bun', ['internal/index.ts'], {
    cwd: root,
    env: backendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const backendLogs = createProcessLogger('backend', backend)

  const teardown = async () => {
    try {
      await fetch(`${backendUrl}/api/shutdown`, { method: 'POST' }).catch(() => {})
    } catch {}

    if (!backend.killed) backend.kill('SIGTERM')
    if (!mock.killed) mock.kill('SIGTERM')
    rmSync(tempHome, { recursive: true, force: true })
  }

  const fail = async (message) => {
    console.error(`[smoke:backend] ${message}`)
    console.error('[smoke:backend] mock-gateway stdout/stderr:')
    console.error(mockLogs().stdout)
    console.error(mockLogs().stderr)
    console.error('[smoke:backend] backend stdout/stderr:')
    console.error(backendLogs().stdout)
    console.error(backendLogs().stderr)
    await teardown()
    process.exit(1)
  }

  try {
    await waitForHttp(`${backendUrl}/api/health`)

    const health = await fetch(`${backendUrl}/api/health`).then((res) => res.json())
    if (health.status !== 'ok') {
      await fail(`Unexpected health payload: ${JSON.stringify(health)}`)
    }

    const status = await fetch(`${backendUrl}/api/status`).then((res) => res.json())
    if (status.gateway !== gatewayUrl) {
      await fail(`Unexpected gateway URL in /api/status: ${JSON.stringify(status)}`)
    }

    const models = await fetch(`${backendUrl}/api/models`).then((res) => res.json())
    if (!Array.isArray(models.models) || models.models.length === 0) {
      await fail(`Expected mock models from /api/models, got ${JSON.stringify(models)}`)
    }

    const check = await fetch(
      `${backendUrl}/api/config/providers/openclaw/check?gatewayUrl=${encodeURIComponent(gatewayUrl)}`,
    ).then((res) => res.json())
    if (!check.ok || check.config?.defaultModel !== 'commonstack/mock-chat') {
      await fail(`Unexpected gateway check payload: ${JSON.stringify(check)}`)
    }

    const chatResponse = await fetch(`${backendUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionKey: 'agent:main:smoke',
        prompt: 'hello smoke',
        thinking: 'off',
      }),
    })

    if (!chatResponse.ok) {
      await fail(`Chat request failed with status ${chatResponse.status}`)
    }

    const frames = await parseSse(chatResponse)
    const textFrame = frames.find((frame) => frame.event === 'text')
    const doneFrame = frames.find((frame) => frame.event === 'done')
    if (!textFrame || !doneFrame) {
      await fail(`Expected text and done SSE events, got ${JSON.stringify(frames)}`)
    }

    const sessions = await fetch(`${backendUrl}/api/sessions`).then((res) => res.json())
    if (!Array.isArray(sessions.sessions) || sessions.sessions.length !== 1) {
      await fail(`Expected one smoke session, got ${JSON.stringify(sessions)}`)
    }

    console.log('[smoke:backend] passed')
    await teardown()
  } catch (error) {
    await fail(error instanceof Error ? error.message : String(error))
  }
}

main()
