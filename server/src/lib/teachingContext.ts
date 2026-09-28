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

/// How the section is taught. Distinct from the course: the same Algebra 2 runs
/// as an honors section and as an inclusion section, and what a teacher needs
/// from a coach differs sharply between them.
export const COURSE_LEVELS = ['AP', 'Honors', 'Regular', 'Inclusion'] as const

export type CourseLevel = (typeof COURSE_LEVELS)[number]

export function isCourseLevel(value: unknown): value is CourseLevel {
  return typeof value === 'string' && (COURSE_LEVELS as readonly string[]).includes(value)
}

/// What each level should change about the coaching, spelled out for the model
/// — otherwise "Inclusion" reads as a label rather than a working constraint.
export const COURSE_LEVEL_GUIDANCE: Record<string, string> = {
  AP: 'An AP section: an external exam with a fixed syllabus and a hard date, students who mostly opted in, real pace pressure, and a wide gap between students who can do the work and students who are holding on.',
  Honors:
    'An honors section: capable, often compliant students, a faster pace, and the specific risk that performance gets mistaken for understanding. Coaching should push depth, not more work.',
  Regular:
    'A regular section: the widest mix of readiness, motivation, and outside circumstance in the building. Assume nothing about prior knowledge.',
  Inclusion:
    'An inclusion or co-taught section: students with IEPs and 504 plans alongside general-education peers, usually with a co-teacher or paraprofessional in the room. Coaching must respect accommodations as non-negotiable, treat the co-teacher as a partner rather than an aide, and never suggest anything that would single a student out.',
}
