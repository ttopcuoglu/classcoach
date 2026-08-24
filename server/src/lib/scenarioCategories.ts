export const SCENARIO_CATEGORIES = [
  'defiance',
  'disengagement',
  'peer_conflict',
  'disruption',
  'transitions',
  'technology_misuse',
] as const

export const GRADE_BANDS = ['6-8', '9-12'] as const

export function pickCategory(value: unknown): (typeof SCENARIO_CATEGORIES)[number] {
  if (typeof value === 'string' && (SCENARIO_CATEGORIES as readonly string[]).includes(value)) {
    return value as (typeof SCENARIO_CATEGORIES)[number]
  }
  return SCENARIO_CATEGORIES[Math.floor(Math.random() * SCENARIO_CATEGORIES.length)]
}

export function pickGradeBand(value: unknown): (typeof GRADE_BANDS)[number] {
  return value === '9-12' ? '9-12' : '6-8'
}
