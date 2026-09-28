// Ask & Practice asks for a single grade, not a three-year band: a 6th-grade
// scenario and an 8th-grade one are not the same scenario. Mirrors
// server/src/lib/gradeLevels.ts — the server derives the band from this.
export const GRADE_LEVELS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const

export type GradeLevel = (typeof GRADE_LEVELS)[number]

export function isGradeLevel(value: string | null | undefined): value is GradeLevel {
  return !!value && (GRADE_LEVELS as readonly string[]).includes(value)
}

/// "K" -> "Kindergarten", "3" -> "3rd grade". Used where a bare number would
/// read as a count rather than a grade.
export function gradeLevelLabel(level: string): string {
  if (level === 'K') return 'Kindergarten'
  const n = Number.parseInt(level, 10)
  if (Number.isNaN(n)) return level
  const suffix =
    n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix} grade`
}

/// Short form for the chip row, where thirteen labels have to fit.
export function gradeChipLabel(level: string): string {
  return level
}

// The subjects Ask & Practice offers. "Other" reveals a free-text field, and
// what gets stored is what the teacher typed — never the literal "Other".
export const SUBJECTS = ['ELA', 'Math', 'Science', 'History/SS', 'Technology', 'AP', 'Fine Arts'] as const

export const OTHER_SUBJECT = 'Other'

/// Best guess at a grade from the free-text `gradeLevels` on a teacher's
/// profile ("7th,8th" -> "7"). Falls back to 7th, the app's mid-point.
export function gradeFromProfile(gradeLevels: string | null | undefined): GradeLevel {
  const text = (gradeLevels ?? '').toLowerCase()
  if (/\bk\b|kinder/.test(text)) return 'K'
  const match = text.match(/\b(1[0-2]|[1-9])\b/)
  if (match && isGradeLevel(match[1])) return match[1] as GradeLevel
  if (/high ?school/.test(text)) return '10'
  if (/middle ?school/.test(text)) return '7'
  if (/elementary/.test(text)) return '3'
  return '7'
}

/// Map a teacher's free-text profile subject onto the offered list, so the
/// default is a real chip rather than an unmatched free-text value.
export function subjectFromProfile(subjects: string | null | undefined): string | undefined {
  const first = subjects?.split(',')[0]?.trim()
  if (!first) return undefined
  const lower = first.toLowerCase()
  const match = SUBJECTS.find((s) => s.toLowerCase() === lower)
  if (match) return match
  if (/english|language arts|reading|literature|writing/.test(lower)) return 'ELA'
  if (/math|algebra|geometry|calculus|statistic/.test(lower)) return 'Math'
  if (/science|biology|chemistry|physics/.test(lower)) return 'Science'
  if (/history|social studies|civics|government|geography|economics/.test(lower)) return 'History/SS'
  if (/tech|computer|coding|engineering|robotics/.test(lower)) return 'Technology'
  if (/art|music|theat|drama|band|chorus|dance/.test(lower)) return 'Fine Arts'
  // Anything else is kept verbatim — it lands in the "Other" field.
  return first
}
