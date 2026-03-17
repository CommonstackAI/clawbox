import crypto from 'crypto'
import { getConfig } from '../config/index'
import { createLogger } from '../logger'
import {
  openclawChatHistory,
  openclawChatSend,
  openclawDeleteSession,
  openclawOnEvent,
  openclawRpc,
} from './openclaw-rpc'

type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionOptions = {
  maxTokens?: number
  temperature?: number
}

const COMPLETION_TIMEOUT_MS = 60_000
const INTERNAL_METADATA_SESSION_PREFIX = 'agent:main:clawbox-title:'
const DELETE_SESSION_RETRY_DELAYS_MS = [100, 250, 500]
const ACTIVE_SESSION_DELETE_ERROR_RE = /still active|active run/i
const log = createLogger('OpenClawCompletions')

export function isInternalMetadataSessionKey(sessionKey: string | null | undefined): boolean {
  if (!sessionKey) return false
  return sessionKey.trim().toLowerCase().startsWith(INTERNAL_METADATA_SESSION_PREFIX)
}

export function getOpenclawDefaultModelTarget(): { gatewayUrl: string; model: string } | null {
  const config = getConfig()
  const gatewayUrl = config.providers?.openclaw?.baseUrl?.trim() || ''
  const model = config.providers?.openclaw?.defaultModel?.trim() || ''

  if (!gatewayUrl || !model) {
    return null
  }

  return { gatewayUrl, model }
}

export async function callOpenclawDefaultModelChatCompletion(
  messages: ChatCompletionMessage[],
  _options: ChatCompletionOptions = {},
): Promise<string> {
  const target = getOpenclawDefaultModelTarget()
  if (!target) {
    throw new Error('OpenClaw default model not configured')
  }

  const sessionKey = `${INTERNAL_METADATA_SESSION_PREFIX}${crypto.randomUUID()}`

  try {
    await openclawRpc(target.gatewayUrl, 'sessions.patch', {
      key: sessionKey,
      model: target.model,
      verboseLevel: 'off',
      thinkingLevel: 'off',
      responseUsage: 'off',
    })

    const prompt = buildPrompt(messages)
    const { runId } = await openclawChatSend(target.gatewayUrl, sessionKey, prompt, 'off')
    return await waitForRunText(target.gatewayUrl, sessionKey, runId)
  } finally {
    await cleanupInternalMetadataSession(target.gatewayUrl, sessionKey)
  }
}

function buildPrompt(messages: ChatCompletionMessage[]): string {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content.trim()}`)
    .join('\n\n')
    .trim()
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((block: any) => {
      if (block?.type !== 'text' || typeof block.text !== 'string') return ''
      return block.text
    })
    .join('')
    .trim()
}

async function readAssistantText(gatewayUrl: string, sessionKey: string): Promise<string> {
  const history = await openclawChatHistory(gatewayUrl, sessionKey, 20)
  const messages = Array.isArray(history?.messages) ? history.messages : []

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role !== 'assistant') continue
    const text = extractTextFromContent(message.content)
    if (text) return text
  }

  return ''
}

async function cleanupInternalMetadataSession(gatewayUrl: string, sessionKey: string): Promise<void> {
  for (let attempt = 0; attempt <= DELETE_SESSION_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await openclawDeleteSession(gatewayUrl, sessionKey)
      return
    } catch (error: any) {
      const retryable = isRetryableInternalMetadataDeleteError(error)
      const isLastAttempt = attempt === DELETE_SESSION_RETRY_DELAYS_MS.length
      if (!retryable || isLastAttempt) {
        const suffix = attempt > 0 ? ` after ${attempt + 1} attempts` : ''
        log.warn(`Failed to delete internal metadata session ${sessionKey}${suffix}: ${formatErrorMessage(error)}`)
        return
      }
      await sleep(DELETE_SESSION_RETRY_DELAYS_MS[attempt])
    }
  }
}

function isRetryableInternalMetadataDeleteError(error: unknown): boolean {
  return ACTIVE_SESSION_DELETE_ERROR_RE.test(formatErrorMessage(error))
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForRunText(
  gatewayUrl: string,
  sessionKey: string,
  runId: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      fn()
    }

    const resolveFromHistory = async () => {
      try {
        const text = await readAssistantText(gatewayUrl, sessionKey)
        if (!text) {
          throw new Error('Empty response from OpenClaw default model')
        }
        finish(() => resolve(text))
      } catch (error: any) {
        finish(() => reject(error))
      }
    }

    const timer = setTimeout(async () => {
      try {
        const text = await readAssistantText(gatewayUrl, sessionKey)
        if (!text) {
          throw new Error(`OpenClaw completion timed out (${COMPLETION_TIMEOUT_MS}ms)`)
        }
        finish(() => resolve(text))
      } catch (error: any) {
        finish(() => reject(error))
      }
    }, COMPLETION_TIMEOUT_MS)

    const unsubscribe = openclawOnEvent((event) => {
      const payload = event.payload || {}
      if (payload.runId && payload.runId !== runId) return
      if (payload.sessionKey && payload.sessionKey !== sessionKey) return

      const lifecycleEnded =
        event.type === 'agent' &&
        payload.stream === 'lifecycle' &&
        payload.data?.phase === 'end'

      const chatFinished =
        event.type === 'chat' &&
        payload.state === 'final'

      if (lifecycleEnded || chatFinished) {
        void resolveFromHistory()
      }
    })
  })
}
