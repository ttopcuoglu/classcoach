export const SCENARIO_CATEGORIES = [
  'defiance',
  'disengagement',
  'peer_conflict',
  'disruption',
  'transitions',
  'technology_misuse',
] as const

export const GRADE_BANDS = ['K-5', '6-8', '9-12'] as const

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export function pickCategory(value: unknown): (typeof SCENARIO_CATEGORIES)[number] {
  if (typeof value === 'string' && (SCENARIO_CATEGORIES as readonly string[]).includes(value)) {
    return value as (typeof SCENARIO_CATEGORIES)[number]
  }
  return SCENARIO_CATEGORIES[Math.floor(Math.random() * SCENARIO_CATEGORIES.length)]
}

export function pickGradeBand(value: unknown): (typeof GRADE_BANDS)[number] {
  if (typeof value === 'string' && (GRADE_BANDS as readonly string[]).includes(value)) {
    return value as (typeof GRADE_BANDS)[number]
  }
  return '6-8'
}

export function pickDifficulty(value: unknown): (typeof DIFFICULTY_LEVELS)[number] {
  if (typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)) {
    return value as (typeof DIFFICULTY_LEVELS)[number]
  }
  return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)]
}
