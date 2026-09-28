// What Ask & Practice asks about the teacher's room. Mirrors
// server/src/lib/teachingContext.ts.
//
// Four fields, each narrowing the one before it: grade band, subject, and — at
// 9-12, where a subject splits into genuinely different courses — the course
// and the level it's taught at. A 9th-grade Algebra 1 inclusion section and an
// AP Calculus section are not the same room.

export const GRADE_BANDS = ['K-5', '6-8', '9-12'] as const

export type GradeBand = (typeof GRADE_BANDS)[number]

// AP used to sit in this list. It moved to COURSE_LEVELS, where it belongs: AP
// is how a course is taught, not what subject it is.
export const SUBJECTS = ['ELA', 'Math', 'Science', 'History/SS', 'Technology', 'Fine Arts'] as const

export const OTHER_SUBJECT = 'Other'

/// The courses a subject splits into at 9-12. Offered only for that band —
/// "Algebra 2" means something specific in a high school schedule, while a 4th
/// grade teacher teaches math, full stop.
export const COURSES_BY_SUBJECT: Record<string, readonly string[]> = {
  ELA: ['English 9', 'English 10', 'English 11', 'English 12', 'Creative Writing', 'Journalism'],
  Math: ['Algebra 1', 'Geometry', 'Algebra 2', 'Pre-Calculus', 'Calculus', 'Statistics'],
  Science: ['Biology', 'Chemistry', 'Physics', 'Environmental Science', 'Anatomy', 'Computer Science'],
  'History/SS': ['World History', 'US History', 'Government', 'Economics', 'Psychology', 'Geography'],
  Technology: ['Computer Science', 'Engineering', 'Robotics', 'Digital Media', 'Business/IT'],
  'Fine Arts': ['Visual Art', 'Music', 'Theater', 'Dance', 'Film'],
}

export function coursesFor(
  gradeBand: string | null | undefined,
  subject: string | null | undefined,
): readonly string[] {
  if (gradeBand !== '9-12' || !subject) return []
  return COURSES_BY_SUBJECT[subject] ?? []
}

/// How the section is taught. Distinct from the course: the same Algebra 2 runs
/// as an honors section and as an inclusion section, and what a teacher needs
/// from a coach differs sharply between them.
export const COURSE_LEVELS = ['AP', 'Honors', 'Regular', 'Inclusion'] as const

export type CourseLevel = (typeof COURSE_LEVELS)[number]

/// One line of plain English per level, shown under the chips so a teacher
/// knows what picking it will change.
export const COURSE_LEVEL_BLURB: Record<string, string> = {
  AP: 'Fixed syllabus, an exam date, real pace pressure.',
  Honors: 'Capable and compliant — depth matters more than more work.',
  Regular: 'The widest mix of readiness in the building.',
  Inclusion: 'IEPs and 504s, accommodations, usually a co-teacher in the room.',
}

/// Best guess at a band from the free-text `gradeLevels` on a teacher's profile.
export function bandFromProfile(gradeLevels: string | null | undefined): GradeBand {
  const text = (gradeLevels ?? '').toLowerCase()
  if (/\b(9|10|11|12)\b|9-12|high ?school/.test(text)) return '9-12'
  if (/\bk\b|kindergarten|\b[1-5](st|nd|rd|th)?\b|elementary|k-5/.test(text)) return 'K-5'
  return '6-8'
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
  if (/science|biology|chemistry|physics|anatomy/.test(lower)) return 'Science'
  if (/history|social studies|civics|government|geography|economics|psychology/.test(lower)) return 'History/SS'
  if (/tech|computer|coding|engineering|robotics/.test(lower)) return 'Technology'
  if (/art|music|theat|drama|band|chorus|dance|film/.test(lower)) return 'Fine Arts'
  // Anything else is kept verbatim — it lands in the "Other" field.
  return first
}
