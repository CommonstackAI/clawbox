import type { SkillStatusEntry } from '@/types'

export type SkillReasonCode = 'disabled' | 'blockedByAllowlist'
export type SkillMissingCode = 'tool' | 'config' | 'os'

export function computeSkillMissing(skill: SkillStatusEntry): SkillMissingCode[] {
  const missing = new Set<SkillMissingCode>()

  if (skill.missing.bins.length > 0) {
    missing.add('tool')
  }
  if (skill.missing.env.length > 0 || skill.missing.config.length > 0) {
    missing.add('config')
  }
  if (skill.missing.os.length > 0) {
    missing.add('os')
  }

  return Array.from(missing)
}

export function computeSkillReasonCodes(skill: SkillStatusEntry): SkillReasonCode[] {
  const reasons: SkillReasonCode[] = []
  if (skill.disabled) {
    reasons.push('disabled')
  }
  if (skill.blockedByAllowlist) {
    reasons.push('blockedByAllowlist')
  }
  return reasons
}
