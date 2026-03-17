import type { SkillStatusEntry } from '@/types'

export type SkillGroupId = 'workspace' | 'builtIn' | 'installed' | 'extra' | 'other'

export type SkillGroup = {
  id: SkillGroupId
  skills: SkillStatusEntry[]
}

const GROUP_DEFS: Array<{ id: Exclude<SkillGroupId, 'other'>; sources: string[] }> = [
  { id: 'workspace', sources: ['openclaw-workspace'] },
  { id: 'builtIn', sources: ['openclaw-bundled'] },
  { id: 'installed', sources: ['openclaw-managed'] },
  { id: 'extra', sources: ['openclaw-extra'] },
]

export function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<SkillGroupId, SkillGroup>()
  for (const def of GROUP_DEFS) {
    groups.set(def.id, { id: def.id, skills: [] })
  }

  const other: SkillGroup = { id: 'other', skills: [] }
  const builtInGroup = GROUP_DEFS.find((group) => group.id === 'builtIn')

  for (const skill of skills) {
    const match = skill.bundled
      ? builtInGroup
      : GROUP_DEFS.find((group) => group.sources.includes(skill.source))

    if (match) {
      groups.get(match.id)?.skills.push(skill)
    } else {
      other.skills.push(skill)
    }
  }

  const ordered = GROUP_DEFS
    .map((group) => groups.get(group.id))
    .filter((group): group is SkillGroup => Boolean(group && group.skills.length > 0))

  if (other.skills.length > 0) {
    ordered.push(other)
  }

  return ordered
}
