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
  // The stored value stays `inclusion`: production rows already carry it in
  // Debrief.classMakeup and Scenario.classMakeup, and renaming it would need a
  // migration over two TEXT[] columns to buy nothing a teacher can see.
  { value: 'inclusion', label: 'SPED / 504' },
  { value: 'english_learners', label: 'English learners' },
] as const

export const CLASS_MAKEUP_VALUES: readonly string[] = CLASS_MAKEUP.map((m) => m.value)

export function pickClassMakeup(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && CLASS_MAKEUP_VALUES.includes(v)))]
}

/// Kept apart on purpose. SPED/504 is a disability framework — IDEA, IEPs and
/// 504 plans, accommodations. English learners sit under
/// a different law and need different moves: comprehensible input, vocabulary
/// front-loading, translanguaging. Treating an English learner as though they
/// had a learning disability is one of the classic harmful errors in the field,
/// and folding the two into one option would have taught the coach to make it.
export const CLASS_MAKEUP_GUIDANCE: Record<string, string> = {
  inclusion:
    'Students with IEPs and 504 plans are in this room alongside general-education peers. Their accommodations and modifications are legal obligations rather than suggestions, and nothing you propose may single a student out in front of the class. Do not assume a second adult: some of these rooms are co-taught and some are one teacher alone with thirty kids and five very different plans, so offer moves that work either way — and where there is a co-teacher or paraprofessional, treat them as a partner rather than an aide. A disability is not a statement about intelligence: a student on an IEP may be the strongest thinker in the room and still need the task presented differently.',
  english_learners:
    'This room includes English learners at a range of proficiencies. They are learning the content and the language at once, so the barrier is usually access to the language of the task rather than the thinking behind it — never treat limited English as limited ability, and never treat it as a disability. Useful moves: front-load the vocabulary the task actually requires, make input comprehensible with visuals and demonstration, allow a home language for thinking and drafting, give real wait time, and assess the content rather than the English it is expressed in. English proficiency and content ability are independent of each other: this room contains English learners who are AHEAD of their English-fluent peers in the subject, ones who are average, and ones who are behind, exactly as it does for every other student. Do not default to casting the English learner as the one who is struggling, quiet, or behind — a teacher who only ever rehearses that version learns a stereotype. An English learner is as likely to be the student who spots the flaw in your explanation, finishes first, or already met this content in another language and another curriculum.',
}

/// The room a teacher works in, from their profile, for a surface that
/// never asks.
///
/// Ask and Practice collect a grade band, subject, course and makeup with
/// every question, which is why everything above exists. A chat collects
/// none of it — so without this, "can I use this with my class?" gets
/// answered about a generic classroom, which is the one answer that helps
/// nobody.
///
/// Free text on purpose: this is what Profile stores, and a teacher may
/// have written "6-8", "7th and 8th" or "7". Handing it over as they wrote
/// it is better than guessing at a band.
export function buildRoomContextBlock(
  gradeLevels: string | null | undefined,
  subjects: string | null | undefined,
): string {
  const grades = gradeLevels?.trim()
  const subject = subjects?.trim()
  if (!grades && !subject) return ''
  const described = [grades ? `grade ${grades}` : null, subject].filter(Boolean).join(', ')
  return `\n\nThe teacher's profile says they teach: ${described}. Use it whenever it bears on the answer — judging whether something is pitched right for their students, for instance — rather than reasoning about a classroom in general. It describes what they teach overall, not which class they're asking about this minute: if that distinction matters and they could mean more than one, ask which before answering.\n`
}
