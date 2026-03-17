import { describe, expect, it } from 'vitest'
import { isKnownSoulIconKey, normalizeSoulIconValue } from '@/lib/soul-icons'

describe('normalizeSoulIconValue', () => {
  it('maps legacy default emoji to lucide-backed keys', () => {
    expect(normalizeSoulIconValue('🎯')).toBe('target')
    expect(normalizeSoulIconValue('💻')).toBe('square-terminal')
    expect(normalizeSoulIconValue('🎨')).toBe('palette')
  })

  it('keeps known icon keys unchanged', () => {
    expect(normalizeSoulIconValue('handshake')).toBe('handshake')
    expect(isKnownSoulIconKey('sparkles')).toBe(true)
  })

  it('preserves unknown emoji for text fallback rendering', () => {
    expect(normalizeSoulIconValue('🦊')).toBe('🦊')
    expect(isKnownSoulIconKey('🦊')).toBe(false)
  })

  it('covers every legacy built-in soul default icon', () => {
    expect(normalizeSoulIconValue('🎯')).toBe('target')
    expect(normalizeSoulIconValue('💻')).toBe('square-terminal')
    expect(normalizeSoulIconValue('🎨')).toBe('palette')
    expect(normalizeSoulIconValue('📚')).toBe('book-open')
    expect(normalizeSoulIconValue('🤝')).toBe('handshake')
  })
})
