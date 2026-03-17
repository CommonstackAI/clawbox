import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type WebSocket from 'ws'
import { EventEmitter } from 'events'
import pkg from '../../package.json'
import { getConfig } from '../config/index'
import { createLogger } from '../logger'
import { GATEWAY_PORT } from '../onboard/constants'
import { isPortListening, restartGateway } from '../onboard/gateway'

const log = createLogger('OpenClawRPC')

function shouldSupervisePortableGatewayRestart(): boolean {
  return getConfig().envMode === 'portable'
}

async function restartPortableGatewayAfterConfigPatch(reason: string): Promise<void> {
  if (!shouldSupervisePortableGatewayRestart()) return

  log.info(`Portable config.patch detected; restarting gateway under ClawBox supervision (${reason})`)
  getClient().disconnect()

  const restarted = await restartGateway('portable')
  if (!restarted) {
    log.warn('Portable config.patch restart could not resolve a runnable OpenClaw target')
  }
}

async function recoverPortableGatewayAfterPatchError(error: Error): Promise<void> {
  if (!shouldSupervisePortableGatewayRestart()) return
  if (await isPortListening(GATEWAY_PORT)) return

  log.warn(`Portable config.patch left gateway offline (${error.message}); attempting supervised restart`)
  await restartPortableGatewayAfterConfigPatch('patch error recovery')
}

// ── Device identity helpers ──

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function derivePublicKeyRaw(pem: string): Buffer {
  const spki = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  if (spki.length === prefix.length + 32 && spki.subarray(0, prefix.length).equals(prefix)) {
    return spki.subarray(prefix.length)
  }
  return spki
}

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

interface DeviceAuth {
  tokens: { operator?: { token: string } }
}

function loadDeviceIdentity(): { identity: DeviceIdentity; auth: DeviceAuth } | null {
  try {
    const dir = path.join(os.homedir(), '.openclaw', 'identity')
    const identityPath = path.join(dir, 'device.json')
    if (!fs.existsSync(identityPath)) return null
    const identity = JSON.parse(fs.readFileSync(identityPath, 'utf8'))

    // device-auth.json is optional — token can be empty for initial pairing
    let auth: DeviceAuth = { tokens: {} }
    const authPath = path.join(dir, 'device-auth.json')
    if (fs.existsSync(authPath)) {
      try { auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) } catch {}
    }

    return { identity, auth }
  } catch {
    return null
  }
}

/**
 * Save device auth token received from gateway after successful pairing.
 * This creates/updates ~/.openclaw/identity/device-auth.json
 */
function storeDeviceAuthToken(deviceId: string, authInfo: any): void {
  try {
    const dir = path.join(os.homedir(), '.openclaw', 'identity')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    const authPath = path.join(dir, 'device-auth.json')
    let existing: any = { version: 1, deviceId, tokens: {} }
    if (fs.existsSync(authPath)) {
      try { existing = JSON.parse(fs.readFileSync(authPath, 'utf8')) } catch {}
    }

    const role = authInfo.role || 'operator'
    existing.tokens = existing.tokens || {}
    existing.tokens[role] = {
      token: authInfo.deviceToken,
      role,
      scopes: authInfo.scopes || ['operator.admin'],
      updatedAtMs: Date.now(),
    }

    fs.writeFileSync(authPath, JSON.stringify(existing, null, 2), 'utf8')
    log.info(`Device auth token saved for role "${role}"`)
  } catch (e: any) {
    log.error(`Failed to save device auth token: ${e.message}`)
  }
}

/**
 * Generate a new device identity (Ed25519 keypair) if one doesn't exist.
 * Creates ~/.openclaw/identity/device.json
 */
function ensureDeviceIdentity(): DeviceIdentity {
  const dir = path.join(os.homedir(), '.openclaw', 'identity')
  const identityPath = path.join(dir, 'device.json')

  if (fs.existsSync(identityPath)) {
    return JSON.parse(fs.readFileSync(identityPath, 'utf8'))
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  const rawPub = derivePublicKeyRaw(publicKeyPem)
  const deviceId = crypto.createHash('sha256').update(rawPub).digest('hex')

  const identity: DeviceIdentity & { version: number; createdAtMs: number } = {
    version: 1,
    deviceId,
    publicKeyPem,
    privateKeyPem,
    createdAtMs: Date.now(),
  }

  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2), 'utf8')
  log.info(`Generated new device identity: ${deviceId.slice(0, 16)}...`)
  return identity
}

// ── Event callback types ──

export interface AgentStreamEvent {
  runId: string
  stream: string
  data: any
  sessionKey: string
  seq: number
  ts: number
}

export interface ChatStreamEvent {
  runId: string
  sessionKey: string
  state: 'delta' | 'final'
  message: {
    role: string
    content: Array<{ type: string; text?: string }>
    timestamp: number
  }
}

export type StreamEventCallback = (event: { type: string; payload: any }) => void

export interface OpenClawConnectOptions {
  caps?: string[]
}

function normalizeCaps(caps?: string[]): string[] {
  if (!Array.isArray(caps)) return []
  return [...new Set(caps.map(cap => String(cap || '').trim()).filter(Boolean))].sort()
}

// ── OpenClaw WebSocket RPC Client ──

class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null
  private connected = false
  private connecting = false
  private connectPromise: Promise<void> | null = null
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private idCounter = 0
  private gatewayUrl = ''
  private caps: string[] = []

  async connect(gatewayUrl: string, options: OpenClawConnectOptions = {}): Promise<void> {
    const requestedCaps = normalizeCaps(options.caps)
    const mergedCaps =
      this.gatewayUrl === gatewayUrl
        ? normalizeCaps([...this.caps, ...requestedCaps])
        : requestedCaps

    if (
      this.connected &&
      this.gatewayUrl === gatewayUrl &&
      this.caps.length === mergedCaps.length &&
      this.caps.every((cap, index) => cap === mergedCaps[index])
    ) {
      return
    }
    if (this.connecting && this.connectPromise) return this.connectPromise
    this.gatewayUrl = gatewayUrl
    this.caps = mergedCaps
    this.connecting = true
    this.connectPromise = this._doConnect(gatewayUrl, mergedCaps).finally(() => {
      this.connecting = false
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async _doConnect(gatewayUrl: string, caps: string[]): Promise<void> {
    // Close any existing WebSocket before creating a new one
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.connected = false
    }

    // Parse URL to extract token and build proper WebSocket URL
    let urlToken = ''
    let wsUrl = gatewayUrl
    try {
      const parsed = new URL(gatewayUrl)
      urlToken = parsed.searchParams.get('token') || ''
      // Strip /v1 path suffix, keep query params
      parsed.pathname = parsed.pathname.replace(/\/v1\/?$/, '') || '/'
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = parsed.toString()
    } catch {
      // Fallback to simple string replacement if URL parsing fails
      wsUrl = gatewayUrl
        .replace(/\/v1\/?$/, '')
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
    }

    let deviceData = loadDeviceIdentity()
    if (!deviceData) {
      log.info('No device identity found, generating new one...')
      const identity = ensureDeviceIdentity()
      deviceData = { identity, auth: { tokens: {} } }
    }

    const { identity, auth: deviceAuth } = deviceData
    const WS = (await import('ws')).default

    return new Promise<void>((resolve, reject) => {
      const ws: WebSocket = new WS(wsUrl)
      const connectTimeout = setTimeout(() => {
        ws.close()
        reject(new Error('OpenClaw connect timeout (10s)'))
      }, 10000)

      ws.on('message', (raw: WebSocket.Data) => {
        let msg: any
        try { msg = JSON.parse(raw.toString()) } catch { return }

        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          const nonce = msg.payload?.nonce
          if (!nonce) { ws.close(); reject(new Error('Missing challenge nonce')); return }

          const signedAtMs = Date.now()
          const token = urlToken || deviceAuth.tokens.operator?.token || ''
          const payload = ['v2', identity.deviceId, 'gateway-client', 'backend', 'operator', 'operator.admin', String(signedAtMs), token, nonce].join('|')
          const signature = base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(identity.privateKeyPem)))
          const publicKey = base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem))

          ws.send(JSON.stringify({
            type: 'req', id: '__connect__', method: 'connect',
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: 'gateway-client', version: pkg.version, platform: process.platform, mode: 'backend' },
              caps,
              auth: { token },
              role: 'operator', scopes: ['operator.admin'],
              device: { id: identity.deviceId, publicKey, signature, signedAt: signedAtMs, nonce },
            },
          }))
          return
        }

        if (msg.type === 'res' && msg.id === '__connect__') {
          clearTimeout(connectTimeout)
          if (msg.ok) {
            // Save device token if gateway issued one (auto-pairing for local connections)
            const authInfo = msg.payload?.auth
            if (authInfo?.deviceToken && identity.deviceId) {
              storeDeviceAuthToken(identity.deviceId, authInfo)
            }
            this.ws = ws
            this.connected = true
            log.info('Connected to OpenClaw gateway')
            resolve()
          } else {
            ws.close()
            const errCode = msg.error?.details?.code || msg.error?.code || ''
            const errMsg = msg.error?.message || 'Connect failed'
            if (errCode === 'PAIRING_REQUIRED' || errCode === 'NOT_PAIRED') {
              reject(new Error(`Pairing required: ${errMsg}. Approve this device from the OpenClaw gateway or run "openclaw devices approve --latest"`))
            } else {
              reject(new Error(errMsg))
            }
          }
          return
        }

        if (msg.type === 'res' && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!
          this.pendingRequests.delete(msg.id)
          clearTimeout(pending.timer)
          if (msg.ok) {
            pending.resolve(msg.payload)
          } else {
            pending.reject(new Error(msg.error?.message || 'RPC error'))
          }
          return
        }

        if (msg.type === 'event') {
          this.emit('gateway-event', { type: msg.event, payload: msg.payload })
        }
      })

      ws.on('close', () => {
        this.connected = false
        this.ws = null
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer)
          pending.reject(new Error('WebSocket closed'))
          this.pendingRequests.delete(id)
        }
        log.debug('Disconnected from OpenClaw gateway')
      })

      ws.on('error', (err: Error) => {
        clearTimeout(connectTimeout)
        if (!this.connected) reject(err)
      })
    })
  }

  async request(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<any> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected to OpenClaw gateway')
    }
    const id = String(++this.idCounter)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`))
      }, timeoutMs)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this.ws!.send(JSON.stringify({ type: 'req', id, method, params }))
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
      this.connected = false
    }
    this.caps = []
  }
}

// ── Singleton & public API ──

let client: OpenClawClient | null = null

function getClient(): OpenClawClient {
  if (!client) client = new OpenClawClient()
  return client
}

export async function openclawConnect(gatewayUrl: string, options: OpenClawConnectOptions = {}): Promise<void> {
  await getClient().connect(gatewayUrl, options)
}

export async function openclawRpc(gatewayUrl: string, method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<any> {
  const c = getClient()
  await c.connect(gatewayUrl)
  try {
    return await c.request(method, params, timeoutMs)
  } catch (e: any) {
    // Auto-retry once on connection loss (e.g. gateway restart after config.patch)
    if (e.message === 'WebSocket closed' || e.message === 'Not connected to OpenClaw gateway') {
      log.info(`RPC ${method} failed with "${e.message}", reconnecting and retrying...`)
      c.disconnect()
      await c.connect(gatewayUrl)
      return c.request(method, params, timeoutMs)
    }
    throw e
  }
}

export async function openclawListModels(gatewayUrl: string): Promise<string[]> {
  const result = await openclawRpc(gatewayUrl, 'models.list')
  const models = result?.models ?? result
  if (Array.isArray(models)) {
    return models.map((m: any) => (typeof m === 'string' ? m : m.id)).filter(Boolean)
  }
  return []
}

export async function openclawGetConfig(gatewayUrl: string): Promise<Record<string, any>> {
  return (await openclawRpc(gatewayUrl, 'config.get')) ?? {}
}

export async function openclawPatchConfig(gatewayUrl: string, patch: Record<string, any>): Promise<Record<string, any>> {
  // config.patch requires baseHash from config.get for optimistic concurrency
  const current = await openclawGetConfig(gatewayUrl)
  const baseHash = current?.hash || current?.configHash || ''
  const raw = JSON.stringify(patch)
  try {
    const result = await openclawRpc(gatewayUrl, 'config.patch', { raw, baseHash })
    if (result?.restart?.ok) {
      await restartPortableGatewayAfterConfigPatch('restart scheduled by OpenClaw')
    }
    return result
  } catch (error: any) {
    await recoverPortableGatewayAfterPatchError(error)
    throw error
  }
}

export async function openclawListSessions(gatewayUrl: string, params: Record<string, unknown> = {}): Promise<any> {
  return openclawRpc(gatewayUrl, 'sessions.list', { limit: 50, ...params })
}

export async function openclawDeleteSession(gatewayUrl: string, sessionKey: string): Promise<any> {
  return openclawRpc(gatewayUrl, 'sessions.delete', { key: sessionKey, deleteTranscript: true })
}

export async function openclawResetSession(gatewayUrl: string, sessionKey: string): Promise<any> {
  return openclawRpc(gatewayUrl, 'sessions.reset', { sessionKey, reason: 'reset' })
}

export async function openclawChatHistory(gatewayUrl: string, sessionKey: string, limit = 50): Promise<any> {
  return openclawRpc(gatewayUrl, 'chat.history', { sessionKey, limit })
}

export async function openclawChatSend(
  gatewayUrl: string,
  sessionKey: string,
  message: string,
  thinking: string = 'off',
): Promise<{ runId: string }> {
  const c = getClient()
  await c.connect(gatewayUrl)
  const idempotencyKey = crypto.randomUUID()
  return c.request('chat.send', { sessionKey, idempotencyKey, message, thinking }) as Promise<{ runId: string }>
}

export async function openclawChatAbort(gatewayUrl: string, runId: string): Promise<any> {
  return openclawRpc(gatewayUrl, 'chat.abort', { runId })
}

export function openclawOnEvent(callback: StreamEventCallback): () => void {
  const c = getClient()
  c.on('gateway-event', callback)
  return () => { c.off('gateway-event', callback) }
}

export function openclawGetClient(): OpenClawClient {
  return getClient()
}
