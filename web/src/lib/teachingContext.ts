// What Ask & Practice asks about the teacher's room. Mirrors
// server/src/lib/teachingContext.ts.
//
// Four fields, each narrowing the one before it: grade band, subject, and — at
// 9-12, where a subject splits into genuinely different courses — the course
// and the level it's taught at. A 9th-grade Algebra 1 inclusion section and an
// AP Calculus section are not the same room.

// K-5 used to be one band, and it was the weakest of the three: a kindergarten
// room and a 5th grade room differ more than 9th and 10th do, and elementary
// has no course to disambiguate it. The reporting side already counted K-2 and
// 3-5 separately.
export const GRADE_BANDS = ['K-2', '3-5', '6-8', '9-12'] as const

export type GradeBand = (typeof GRADE_BANDS)[number]

// AP used to sit in this list. It moved to COURSE_LEVELS, where it belongs: AP
// is how a course is taught, not what subject it is.
export const SUBJECTS = ['ELA', 'Math', 'Science', 'History/SS', 'Technology', 'Fine Arts'] as const

export const OTHER_SUBJECT = 'Other'

/// The courses a subject splits into, per band. Middle school and high school
/// both departmentalise, so both have real course names; K-2 and 3-5 do not,
/// because one teacher owns every subject and there is nothing to name.
///
/// This is what pins a room down above elementary: "Algebra 1" says more than a
/// grade number would — it is taken by 7th, 8th and 9th graders depending on
/// track — and it is the difference between a 6th grade topic and an 8th grade
/// one, which a band could never express.
export const COURSES_BY_BAND_AND_SUBJECT: Record<string, Record<string, readonly string[]>> = {
  '6-8': {
    ELA: ['ELA 6', 'ELA 7', 'ELA 8'],
    Math: ['Math 6', 'Math 7', 'Math 8', 'Pre-Algebra', 'Algebra 1'],
    Science: ['Science 6', 'Science 7', 'Science 8', 'Life Science', 'Earth Science', 'Physical Science'],
    'History/SS': ['World Geography', 'Ancient History', 'World History', 'US History', 'Civics'],
    Technology: ['Computer Science', 'STEM & Robotics', 'Digital Media'],
    'Fine Arts': ['Art', 'Band', 'Chorus', 'Theater'],
  },
  '9-12': {
    ELA: ['English 9', 'English 10', 'English 11', 'English 12', 'Creative Writing', 'Journalism'],
    Math: ['Algebra 1', 'Geometry', 'Algebra 2', 'Pre-Calculus', 'Calculus', 'Statistics'],
    Science: ['Biology', 'Chemistry', 'Physics', 'Environmental Science', 'Anatomy', 'Computer Science'],
    'History/SS': ['World History', 'US History', 'Government', 'Economics', 'Psychology', 'Geography'],
    Technology: ['Computer Science', 'Engineering', 'Robotics', 'Digital Media', 'Business/IT'],
    'Fine Arts': ['Visual Art', 'Music', 'Theater', 'Dance', 'Film'],
  },
}

export function coursesFor(
  gradeBand: string | null | undefined,
  subject: string | null | undefined,
): readonly string[] {
  if (!gradeBand || !subject) return []
  return COURSES_BY_BAND_AND_SUBJECT[gradeBand]?.[subject] ?? []
}

// Middle school course naming varies far more by district than high school does
// — "Math 7" here is "Course 2" there — so the list is a shortcut, not a closed
// set. "Other" takes whatever the teacher actually calls it.
export const OTHER_COURSE = 'Other'

/// How the section is tracked. Band-aware: AP is a College Board programme and
/// does not exist before high school, and honours tracks start around 6th
/// grade — a 2nd grade teacher could previously pick AP.
///
/// Rigour only. Who is in the room is a separate question below, because as one
/// single-select the two forced a false choice: a co-taught Algebra 1 with
/// fourteen English learners is Regular AND inclusion AND ESL.
export const COURSE_LEVELS_BY_BAND: Record<string, readonly string[]> = {
  'K-2': ['Regular'],
  '3-5': ['Regular'],
  '6-8': ['Honors', 'Regular'],
  '9-12': ['AP', 'Honors', 'Regular'],
}

export function courseLevelsFor(gradeBand: string | null | undefined): readonly string[] {
  if (!gradeBand) return []
  return COURSE_LEVELS_BY_BAND[gradeBand] ?? []
}

/// One line of plain English per level, shown under the chips so a teacher
/// knows what picking it will change.
export const COURSE_LEVEL_BLURB: Record<string, string> = {
  AP: 'Fixed syllabus, an exam date, real pace pressure.',
  Honors: 'Capable and compliant — depth matters more than more work.',
  Regular: 'The widest mix of readiness in the building.',
}

/// Who is in the room. Multi-select, and kept apart from the level on purpose:
/// SPED/504 is a disability framework (IDEA, IEPs, 504 plans) while English
/// learners sit under a different law and need different moves. Treating an
/// English learner as though they had a learning disability is a classic
/// harmful error, and one shared chip would have taught the coach to make it.
export const CLASS_MAKEUP = [
  // Value stays `inclusion` — see the note in `server/src/lib/teachingContext.ts`.
  { value: 'inclusion', label: 'SPED / 504' },
  { value: 'english_learners', label: 'English learners' },
] as const

export const CLASS_MAKEUP_BLURB: Record<string, string> = {
  inclusion: 'Students on IEPs and 504 plans, with accommodations you have to meet.',
  english_learners: 'Learning the content and the language at once.',
}

/// Best guess at a band from the free-text `gradeLevels` on a teacher's profile.
///
/// Order matters: 9-12 is tested first because "9-12" contains a 1 and a 2 and
/// "K-5" contains a 5, so the narrower bands would otherwise claim them.
///
/// Each branch has to accept ordinals, not just bare numbers — `gradeLevels`
/// is written as "7th,8th" (see User.gradeLevels), so ordinals are the
/// canonical form rather than an edge case. The 9-12 branch was missing its
/// `(th)?`, which made every high-school teacher who wrote "9th,10th" fall
/// through all three branches to the 6-8 default.
export function bandFromProfile(gradeLevels: string | null | undefined): GradeBand {
  const text = (gradeLevels ?? '').toLowerCase()
  if (/\b(9|10|11|12)(th)?\b|9-12|high ?school/.test(text)) return '9-12'
  if (/\bk\b|kindergarten|\b[12](st|nd)?\b|k-2|primary/.test(text)) return 'K-2'
  if (/\b[3-5](rd|th)?\b|3-5|elementary|k-5/.test(text)) return '3-5'
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
