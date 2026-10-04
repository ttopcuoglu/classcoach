import { ALL_SUB_CATEGORIES, findFocusArea, subCategoryValues } from './focusAreas.ts'

// Grade bands live with the rest of the teacher's-room fields now; re-exported
// here so the callers that only ever wanted a band don't have to know that.
export { GRADE_BANDS, pickGradeBand } from './teachingContext.ts'

// Category is now the SECOND level of the taxonomy: every value belongs to
// exactly one focus area (see focusAreas.ts). The six original behavior
// values are still here, as Classroom Management's sub-categories, so nothing
// already stored in Scenario.category / Debrief.category needed rewriting.
export const SCENARIO_CATEGORIES = ALL_SUB_CATEGORIES

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

/// Validate a category, optionally constrained to one focus area — a grading
/// request must never come back with `defiance` just because the model echoed
/// a value from a different area's list.
export function pickCategory(value: unknown, focusArea?: unknown): string {
  const allowed = subCategoryValues(focusArea)
  if (typeof value === 'string' && allowed.includes(value)) return value
  return allowed[Math.floor(Math.random() * allowed.length)]
}

export function isKnownCategory(value: unknown): value is string {
  return typeof value === 'string' && ALL_SUB_CATEGORIES.includes(value)
}

/// True when this category belongs to the given focus area.
export function categoryInArea(category: unknown, focusArea: unknown): boolean {
  const area = findFocusArea(focusArea)
  if (!area) return isKnownCategory(category)
  return typeof category === 'string' && area.subCategories.some((c) => c.value === category)
}

export function pickDifficulty(value: unknown): (typeof DIFFICULTY_LEVELS)[number] {
  if (typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)) {
    return value as (typeof DIFFICULTY_LEVELS)[number]
  }
  return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)]
}
