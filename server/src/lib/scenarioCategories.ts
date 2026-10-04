import { ALL_KINDS, DESCRIBE_MY_OWN, RETIRED_KIND_LABELS, kindValues, topicForKind } from './topics.ts'

// Grade bands live with the rest of the teacher's-room fields now; re-exported
// here so the callers that only ever wanted a band don't have to know that.
export { GRADE_BANDS, pickGradeBand } from './teachingContext.ts'

// "Category" in the database is what the consolidated Practice calls a KIND:
// the second row of the picker, which changes with the topic above it. The
// column keeps its name because every stored row uses it and a rename would
// buy nothing.
//
// Two sets matter here and they are deliberately different:
//
//   * what may be PICKED — only the kinds Practice currently offers, so
//     generation never produces a scenario in a kind no teacher can select.
//   * what is RECOGNIZED — those plus the nine retired kinds, so a teacher's
//     own saved history, their exports and the admin breakdowns all keep
//     resolving. Nothing was deleted from the database to retire a kind.
export const SCENARIO_CATEGORIES = ALL_KINDS

/// Every value that can legitimately appear in Scenario.category or
/// Debrief.category: offered, retired, or the teacher's own situation.
const RECOGNIZED: readonly string[] = [
  ...ALL_KINDS,
  ...Object.keys(RETIRED_KIND_LABELS),
  DESCRIBE_MY_OWN,
]

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

/// Validate a kind, optionally constrained to one topic — a grading request
/// must never come back with `defiance` just because the model echoed a value
/// from a different topic's list.
///
/// Only ever returns an OFFERED kind. A teacher who sends a retired one (a
/// stale tab, an old deep link) gets a fresh pick rather than a scenario in a
/// kind the picker can no longer show them.
export function pickCategory(value: unknown, focusArea?: unknown): string {
  const allowed = kindValues(focusArea)
  if (typeof value === 'string' && allowed.includes(value)) return value
  return allowed[Math.floor(Math.random() * allowed.length)]
}

/// Whether this is a value the app can name. Includes retired kinds: a stored
/// row must never become unrecognizable because its kind left the picker.
export function isKnownCategory(value: unknown): value is string {
  return typeof value === 'string' && RECOGNIZED.includes(value)
}

/// True when this kind belongs to the given topic. Resolves retired kinds too,
/// so a legacy row is still correctly attributed to its topic.
export function categoryInArea(category: unknown, focusArea: unknown): boolean {
  if (!isKnownCategory(category)) return false
  if (typeof focusArea !== 'string' || !focusArea) return true
  // A teacher's own situation belongs to whatever topic they were in — it
  // narrows nothing, so it contradicts nothing.
  if (category === DESCRIBE_MY_OWN) return true
  return topicForKind(category)?.value === focusArea
}

export function pickDifficulty(value: unknown): (typeof DIFFICULTY_LEVELS)[number] {
  if (typeof value === 'string' && (DIFFICULTY_LEVELS as readonly string[]).includes(value)) {
    return value as (typeof DIFFICULTY_LEVELS)[number]
  }
  return DIFFICULTY_LEVELS[Math.floor(Math.random() * DIFFICULTY_LEVELS.length)]
}

/// One notch harder, for the "run it again, tougher" offer after feedback.
/// Advanced is the ceiling and stays there rather than wrapping around to
/// beginner, which would read as the app losing track.
export function harderDifficulty(current: unknown): (typeof DIFFICULTY_LEVELS)[number] {
  const index = DIFFICULTY_LEVELS.indexOf(current as (typeof DIFFICULTY_LEVELS)[number])
  if (index < 0) return 'intermediate'
  return DIFFICULTY_LEVELS[Math.min(index + 1, DIFFICULTY_LEVELS.length - 1)]
}

/// Whether there is a harder notch left to offer.
export function hasHarderDifficulty(current: unknown): boolean {
  return current !== 'advanced' && DIFFICULTY_LEVELS.includes(current as (typeof DIFFICULTY_LEVELS)[number])
}
