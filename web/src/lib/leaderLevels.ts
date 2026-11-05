import type { LeaderArea, LeaderLevel } from './api'

// Leader's Corner levels, for the superadmin roster. The same four as
// server/src/lib/leaderLevels.ts, which is what decides access; this list is
// only labels.
export const LEADER_LEVEL_OPTIONS: { value: LeaderLevel; label: string; titles: string }[] = [
  { value: 'district', label: 'District', titles: 'District Leader' },
  { value: 'building', label: 'Building', titles: 'Principal' },
  { value: 'assistant', label: 'Assistant', titles: 'AP / VP, Deans' },
  { value: 'teacher_leader', label: 'Teacher-leader', titles: 'Curriculum Supervisor, Dept Head, Coach' },
]

export const LEADER_AREA_OPTIONS: { value: LeaderArea; label: string }[] = [
  { value: 'student_life', label: 'Student life & discipline' },
  { value: 'academics', label: 'Academics & instruction' },
]

// District and building leaders hold every area and evaluate; the roster
// offers areas and evaluation only for the other two.
export function hasLeaderOptions(level: LeaderLevel | '' | undefined): boolean {
  return level === 'assistant' || level === 'teacher_leader'
}

// What picking a level fills in, so most people take one click: a VP usually
// covers both areas and evaluates, a coach is academics and doesn't.
export function leaderDefaults(level: LeaderLevel | ''): { leaderAreas: LeaderArea[]; leaderEvaluates: boolean } {
  if (level === 'teacher_leader') return { leaderAreas: ['academics'], leaderEvaluates: false }
  if (level === 'assistant') return { leaderAreas: ['student_life', 'academics'], leaderEvaluates: true }
  return { leaderAreas: [], leaderEvaluates: false }
}

export function leaderLevelLabel(value: LeaderLevel | null | undefined): string | null {
  return LEADER_LEVEL_OPTIONS.find((l) => l.value === value)?.label ?? null
}
