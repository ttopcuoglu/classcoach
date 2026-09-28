// What Ask & Practice asks about the teacher's room, so coaching and scenarios
// land somewhere real rather than in a generic classroom.
//
// Four fields, each narrowing the one before it: grade band, subject, and — at
// 9-12, where a subject splits into genuinely different courses — the course
// and the level it's taught at. A 9th-grade Algebra 1 inclusion section and an
// AP Calculus section are not the same room, and a scenario written for one is
// useless in the other.

// K-5 used to be one band. It was the weakest of the three by a distance: a
// kindergarten room and a 5th grade room differ more than 9th and 10th do, and
// elementary has no course to disambiguate it, so the band carried all the
// weight alone. The reporting side already counted K-2 and 3-5 separately
// (see admin.ts and breakdownGroups.ts, which rolls the two back up into K-5).
export const GRADE_BANDS = ['K-2', '3-5', '6-8', '9-12'] as const

export type GradeBand = (typeof GRADE_BANDS)[number]

export function pickGradeBand(value: unknown): GradeBand {
  if (typeof value === 'string' && (GRADE_BANDS as readonly string[]).includes(value)) {
    return value as GradeBand
  }
  return '6-8'
}

export function gradeBandLabel(band: string): string {
  switch (band) {
    case 'K-2':
      return 'primary (K-2)'
    case '3-5':
      return 'upper elementary (3-5)'
    case '6-8':
      return 'middle school (6-8)'
    default:
      return 'high school (9-12)'
  }
}

// AP used to sit in this list. It moved to COURSE_LEVELS below, where it
// belongs: AP is how a course is taught, not what subject it is — an AP Biology
// teacher teaches Science.
export const SUBJECTS = [
  'ELA',
  'Math',
  'Science',
  'History/SS',
  'Technology',
  'Fine Arts',
] as const

export const OTHER_SUBJECT = 'Other'

/// The courses a subject splits into, per band. Middle school and high school
/// both departmentalise, so both have real course names; K-2 and 3-5 do not,
/// because one teacher owns every subject and there is nothing to name.
///
/// This is what actually pins a room down above elementary. "Algebra 1" says
/// more than a grade number would — it is taken by 7th, 8th and 9th graders
/// depending on track — and it is the difference between a 6th grade topic and
/// an 8th grade one, which a band could never express.
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

/// True when this band/subject offers courses at all — the test the routes use
/// to decide whether a course is a real choice or stale client state.
export function offersCourses(gradeBand: string | null | undefined, subject: string | null | undefined): boolean {
  return coursesFor(gradeBand, subject).length > 0
}

// Middle school course naming varies far more by district than high school
// does — "Math 7" here is "Course 2" there — so the list is a shortcut, not a
// closed set. "Other" takes whatever the teacher actually calls it.
export const OTHER_COURSE = 'Other'

/// How the section is tracked. Band-aware: AP is a College Board programme and
/// does not exist before high school, and honours tracks start around 6th
/// grade — a 2nd grade teacher could previously pick AP and have the coach told
/// there was an external exam with a fixed syllabus.
///
/// This is a rigour axis only. Who is in the room is a separate question, and
/// mixing the two into one single-select forced a false choice: a co-taught
/// Algebra 1 with fourteen English learners is Regular AND inclusion AND ESL.
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

export function isCourseLevelFor(value: unknown, gradeBand: string | null | undefined): value is string {
  return typeof value === 'string' && courseLevelsFor(gradeBand).includes(value)
}

export const COURSE_LEVEL_GUIDANCE: Record<string, string> = {
  AP: 'An AP section: an external exam with a fixed syllabus and a hard date, students who mostly opted in, real pace pressure, and a wide gap between students who can do the work and students who are holding on.',
  Honors:
    'An honours or accelerated section: capable, often compliant students, a faster pace, and the specific risk that performance gets mistaken for understanding. Coaching should push depth, not more work.',
  Regular:
    'A regular section: the widest mix of readiness, motivation, and outside circumstance in the building. Assume nothing about prior knowledge.',
}

/// Who is in the room. Multi-select, and deliberately NOT part of the level:
/// these are not tracking choices, they describe the students and the supports,
/// and a section is routinely more than one of them at once.
export const CLASS_MAKEUP = [
  { value: 'inclusion', label: 'Co-taught / inclusion' },
  { value: 'english_learners', label: 'English learners' },
] as const

export const CLASS_MAKEUP_VALUES: readonly string[] = CLASS_MAKEUP.map((m) => m.value)

export function pickClassMakeup(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && CLASS_MAKEUP_VALUES.includes(v)))]
}

/// Kept apart on purpose. Inclusion is a disability framework — IDEA, IEPs and
/// 504 plans, accommodations, usually a co-teacher. English learners sit under
/// a different law and need different moves: comprehensible input, vocabulary
/// front-loading, translanguaging. Treating an English learner as though they
/// had a learning disability is one of the classic harmful errors in the field,
/// and folding the two into one option would have taught the coach to make it.
export const CLASS_MAKEUP_GUIDANCE: Record<string, string> = {
  inclusion:
    'Students with IEPs and 504 plans are in this room alongside general-education peers, usually with a co-teacher or paraprofessional. Accommodations are non-negotiable, the co-teacher is a partner rather than an aide, and nothing you suggest may single a student out.',
  english_learners:
    'This room includes English learners at a range of proficiencies. They are learning the content and the language at once, so the barrier is usually access to the language of the task rather than the thinking behind it — never treat limited English as limited ability, and never treat it as a disability. Useful moves: front-load the vocabulary the task actually requires, make input comprehensible with visuals and demonstration, allow a home language for thinking and drafting, give real wait time, and assess the content rather than the English it is expressed in.',
}

