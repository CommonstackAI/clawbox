#!/usr/bin/env node

import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'

function parseArgs(argv) {
  const args = { port: 18789 }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--port') {
      args.port = Number(argv[i + 1] ?? '18789')
      i += 1
    }
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/mock-gateway.mjs [--port 18789]')
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

const { port } = parseArgs(process.argv.slice(2))
const wss = new WebSocketServer({ port })
const sessions = new Map()

function getSession(sessionKey) {
  if (!sessions.has(sessionKey)) {
    sessions.set(sessionKey, {
      key: sessionKey,
      label: sessionKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      verboseLevel: 'off',
      messages: [],
    })
  }
  return sessions.get(sessionKey)
}

function sendJson(ws, payload) {
  ws.send(JSON.stringify(payload))
}

function sendResponse(ws, id, payload, ok = true) {
  sendJson(ws, { type: 'res', id, ok, payload })
}

function sendError(ws, id, message) {
  sendJson(ws, {
    type: 'res',
    id,
    ok: false,
    error: { message },
  })
}

function emitAgentEvent(ws, payload) {
  sendJson(ws, {
    type: 'event',
    event: 'agent',
    payload,
  })
}

function baseConfig() {
  return {
    hash: 'mock-config-hash',
    parsed: {
      agents: {
        defaults: {
          model: {
            primary: 'commonstack/mock-chat',
          },
        },
      },
      models: {
        providers: {
          commonstack: {
            baseUrl: 'https://api.example.invalid/v1',
          },
        },
      },
    },
  }
}

function scheduleChatResponse(ws, sessionKey, message) {
  const session = getSession(sessionKey)
  const runId = `mock-run-${crypto.randomUUID()}`
  const reply = `Mock reply: ${message}`
  const now = Date.now()

  session.messages.push({
    role: 'user',
    content: [{ type: 'text', text: message }],
    timestamp: now,
  })
  session.messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: reply }],
    timestamp: now + 1,
  })
  session.updatedAt = new Date().toISOString()
  session.messageCount = session.messages.length

  setTimeout(() => {
    emitAgentEvent(ws, {
      runId,
      stream: 'assistant',
      data: { delta: reply },
      sessionKey,
      seq: 1,
      ts: Date.now(),
    })
  }, 10)

  setTimeout(() => {
    emitAgentEvent(ws, {
      runId,
      stream: 'lifecycle',
      data: { phase: 'end' },
      sessionKey,
      seq: 2,
      ts: Date.now(),
    })
  }, 30)

  return { runId }
}

wss.on('connection', (ws) => {
  const nonce = crypto.randomBytes(16).toString('hex')
  sendJson(ws, {
    type: 'event',
    event: 'connect.challenge',
    payload: { nonce },
  })

  ws.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }

    if (message.type !== 'req') return

    if (message.id === '__connect__' && message.method === 'connect') {
      sendResponse(ws, message.id, {
        auth: {
          role: 'operator',
          deviceToken: 'mock-device-token',
        },
      })
      return
    }

    switch (message.method) {
      case 'models.list':
        sendResponse(ws, message.id, {
          models: [{ id: 'commonstack/mock-chat' }],
        })
        return

      case 'config.get':
        sendResponse(ws, message.id, baseConfig())
        return

      case 'config.patch':
        sendResponse(ws, message.id, { ok: true, restart: { ok: false } })
        return

      case 'sessions.list':
        sendResponse(ws, message.id, {
          sessions: [...sessions.values()].map((session) => ({
            key: session.key,
            label: session.label,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messageCount,
          })),
        })
        return

      case 'sessions.preview': {
        const session = sessions.get(message.params?.sessionKey)
        sendResponse(
          ws,
          message.id,
          session
            ? { label: session.label, messageCount: session.messageCount }
            : { label: message.params?.sessionKey || 'unknown', messageCount: 0 },
        )
        return
      }

      case 'sessions.patch': {
        const sessionKey = message.params?.key || message.params?.sessionKey
        const session = getSession(sessionKey)
        if (typeof message.params?.verboseLevel === 'string') session.verboseLevel = message.params.verboseLevel
        if (typeof message.params?.label === 'string') session.label = message.params.label
        session.updatedAt = new Date().toISOString()
        sendResponse(ws, message.id, { ok: true })
        return
      }

      case 'sessions.reset': {
        const session = getSession(message.params?.sessionKey)
        session.messages = []
        session.messageCount = 0
        session.updatedAt = new Date().toISOString()
        sendResponse(ws, message.id, { ok: true })
        return
      }

      case 'sessions.delete':
        sessions.delete(message.params?.key)
        sendResponse(ws, message.id, { ok: true })
        return

      case 'chat.history': {
        const session = getSession(message.params?.sessionKey)
        sendResponse(ws, message.id, {
          messages: session.messages,
          verboseLevel: session.verboseLevel,
        })
        return
      }

      case 'chat.send': {
        const sessionKey = message.params?.sessionKey || `agent:main:${crypto.randomUUID()}`
        const prompt = typeof message.params?.message === 'string' ? message.params.message : ''
        sendResponse(ws, message.id, scheduleChatResponse(ws, sessionKey, prompt))
        return
      }

      default:
        sendError(ws, message.id, `Mock gateway does not implement ${message.method}`)
    }
  })
})

function shutdown(code = 0) {
  for (const client of wss.clients) client.close()
  wss.close(() => process.exit(code))
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log(`[mock-gateway] listening on ws://127.0.0.1:${port}`)
