import type { LeaderLevel } from './api'

// Leader's Corner levels, for the superadmin roster. The same four as
// server/src/lib/leaderLevels.ts, which is what decides access; this list is
// only labels.
export const LEADER_LEVEL_OPTIONS: { value: LeaderLevel; label: string; titles: string }[] = [
  { value: 'district', label: 'District', titles: 'Superintendent, District Leader' },
  { value: 'building', label: 'Building', titles: 'Principal' },
  { value: 'assistant', label: 'Assistant', titles: 'Assistant / Vice Principal' },
  { value: 'teacher_leader', label: 'Teacher-leader', titles: 'Supervisor, Dept Head, Coach' },
]

export function leaderLevelLabel(value: LeaderLevel | null | undefined): string | null {
  return LEADER_LEVEL_OPTIONS.find((l) => l.value === value)?.label ?? null
}
