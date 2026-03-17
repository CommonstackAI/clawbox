import crypto from 'node:crypto'
import type { ChannelAuthSession, ChannelAuthSessionState } from './types'

const AUTH_SESSION_TTL_MS = 10 * 60 * 1000

const sessions = new Map<string, ChannelAuthSession>()

function cleanupExpiredSessions(): void {
  const now = Date.now()
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId)
    }
  }
}

function nextSessionId(): string {
  return crypto.randomUUID()
}

export function createAuthSession(params: {
  channelId: string
  accountId?: string
  state: ChannelAuthSessionState
  message: string
  qrDataUrl?: string
  error?: string
}): ChannelAuthSession {
  cleanupExpiredSessions()
  const now = Date.now()
  const session: ChannelAuthSession = {
    sessionId: nextSessionId(),
    channelId: params.channelId,
    ...(params.accountId ? { accountId: params.accountId } : {}),
    state: params.state,
    message: params.message,
    ...(params.qrDataUrl ? { qrDataUrl: params.qrDataUrl } : {}),
    ...(params.error ? { error: params.error } : {}),
    startedAt: now,
    updatedAt: now,
    expiresAt: now + AUTH_SESSION_TTL_MS,
  }
  sessions.set(session.sessionId, session)
  return session
}

export function getAuthSession(sessionId: string): ChannelAuthSession | null {
  cleanupExpiredSessions()
  return sessions.get(sessionId) ?? null
}

export function updateAuthSession(
  sessionId: string,
  patch: Partial<Omit<ChannelAuthSession, 'sessionId' | 'channelId' | 'startedAt'>>,
): ChannelAuthSession | null {
  cleanupExpiredSessions()
  const existing = sessions.get(sessionId)
  if (!existing) return null
  const next: ChannelAuthSession = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
    expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
  }
  sessions.set(sessionId, next)
  return next
}

export function cancelAuthSession(sessionId: string): ChannelAuthSession | null {
  return updateAuthSession(sessionId, {
    state: 'cancelled',
    message: 'Login tracking cancelled in ClawBox.',
  })
}
