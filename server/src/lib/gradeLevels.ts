// Ask & Practice asks for a single grade, not a band: a 6th-grade scenario and
// an 8th-grade one are not the same scenario, and a band of three years hid
// that. `Scenario.gradeBand` stays alongside it, derived — the curated fallback
// bank is hand-written per band, and every row that predates this change has a
// band and no grade level.

export const GRADE_LEVELS = [
  'K',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
] as const

export type GradeLevel = (typeof GRADE_LEVELS)[number]

export function isGradeLevel(value: unknown): value is GradeLevel {
  return typeof value === 'string' && (GRADE_LEVELS as readonly string[]).includes(value)
}

export function pickGradeLevel(value: unknown): GradeLevel {
  return isGradeLevel(value) ? value : '7'
}

/// "K" -> "Kindergarten", "1" -> "1st grade", and so on. Used in prompts, where
/// a bare "3" would read as a count rather than a grade.
export function gradeLevelLabel(level: string): string {
  if (level === 'K') return 'Kindergarten'
  const n = Number.parseInt(level, 10)
  if (Number.isNaN(n)) return level
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix} grade`
}

/// The band a grade sits in, kept only so the curated fallback bank — which is
/// written per band — still matches, and so rows stay comparable with the ones
/// written before grade levels existed.
export function bandForGrade(level: string): 'K-5' | '6-8' | '9-12' {
  if (level === 'K') return 'K-5'
  const n = Number.parseInt(level, 10)
  if (Number.isNaN(n) || n <= 5) return 'K-5'
  if (n <= 8) return '6-8'
  return '9-12'
}

/// A grade for a band, for the reverse direction: a teacher whose profile only
/// records a band, or an old row being reopened.
export function gradeForBand(band: string | null | undefined): GradeLevel {
  if (band === 'K-5') return '3'
  if (band === '9-12') return '10'
  return '7'
}

// The subject list Ask & Practice offers. "Other" is the escape hatch — the
// teacher types their own, and what's stored is what they typed, never the
// literal word "Other".
export const SUBJECTS = [
  'ELA',
  'Math',
  'Science',
  'History/SS',
  'Technology',
  'AP',
  'Fine Arts',
] as const

export const OTHER_SUBJECT = 'Other'
