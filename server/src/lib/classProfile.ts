// The teacher's class context — their preps — and the rules around it.
//
// Four rules from the consolidation brief govern everything here:
//
//   1. Never block an action on missing context. Every read path returns
//      something usable, including an empty list, and no caller may refuse to
//      work because a teacher has not filled this in.
//   2. Seed it by inference from data the teacher has already given.
//   3. When the coach needs something it does not know, ask ONE question,
//      and save the answer reversibly.
//   4. Re-confirm at the start of a new school year, and whenever a debrief
//      contradicts what is stored.
//
// Inference lives here rather than in the migration because it reads the
// teacher's plans, assignments and recordings as well as their profile text,
// and because one tested implementation has to serve both the existing
// teachers and every later signup.

import {
  CLASS_MAKEUP_VALUES,
  GRADE_BANDS,
  coursesFor,
  courseLevelsFor,
  type GradeBand,
} from './teachingContext.ts'

/// The shape the API returns and the clients render. `confirmed` is flattened
/// from confirmedAt because that is the only thing a client does with it —
/// decide whether to show the "not quite?" confirmation.
export type ClassContext = {
  id: string
  label: string | null
  gradeBand: string
  subject: string | null
  course: string | null
  courseLevel: string | null
  classMakeup: string[]
  isDefault: boolean
  /// False while this is still a guess the teacher has not agreed to.
  confirmed: boolean
  /// True when it was inferred rather than entered.
  inferred: boolean
  /// The school year it was last confirmed for, if any.
  schoolYear: string | null
}

/// What a teacher can send when creating or editing a prep. Every field is
/// optional except the band, which is the one thing a room cannot be without.
export type ClassContextInput = {
  label?: string | null
  gradeBand: string
  subject?: string | null
  course?: string | null
  courseLevel?: string | null
  classMakeup?: string[]
  isDefault?: boolean
}

// --- school year ---

/// The school year a date falls in, as "2026-2027".
///
/// August is the boundary. It is not right everywhere — southern-hemisphere
/// and year-round schools exist — but it is right for the US K-12 calendar
/// this app is built for, and the consequence of being wrong is one extra
/// confirmation prompt, not lost data.
export function schoolYearOf(date: Date): string {
  const year = date.getUTCFullYear()
  const startYear = date.getUTCMonth() >= 7 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

/// Whether this prep needs re-confirming: either it has never been confirmed,
/// or it was last confirmed for an earlier school year.
///
/// A row confirmed for the current year is left alone — re-asking a teacher
/// something they settled in September is exactly the nagging this feature is
/// supposed to remove.
export function needsReconfirmation(
  prep: { confirmed: boolean; schoolYear: string | null },
  now: Date = new Date(),
): boolean {
  if (!prep.confirmed) return true
  return prep.schoolYear !== schoolYearOf(now)
}

// --- the one editable line ---

/// The standard line: "Grades 9–12 · Biology · Honors · ELs in the room".
///
/// Built from whatever is actually known and nothing else — a prep with only
/// a band renders as just the band rather than as a line full of blanks. An
/// en dash in "Grades 9–12" because it is a range, matching the bands as
/// teachers write them.
export function describeClassContext(prep: {
  gradeBand: string
  subject?: string | null
  course?: string | null
  courseLevel?: string | null
  classMakeup?: string[]
}): string {
  const parts: string[] = [gradeBandPhrase(prep.gradeBand)]
  // The course is more specific than the subject and implies it, so only one
  // of the two is shown — "Biology" says more than "Science · Biology".
  const named = prep.course || prep.subject
  if (named) parts.push(named)
  if (prep.courseLevel) parts.push(prep.courseLevel)
  for (const phrase of makeupPhrases(prep.classMakeup ?? [])) parts.push(phrase)
  return parts.join(' · ')
}

function gradeBandPhrase(band: string): string {
  if (band === 'K-2') return 'Grades K–2'
  if (band === '3-5') return 'Grades 3–5'
  if (band === '6-8') return 'Grades 6–8'
  if (band === '9-12') return 'Grades 9–12'
  // An unrecognized band is still shown rather than dropped — a teacher
  // seeing something odd can fix it; a teacher seeing nothing cannot.
  return band
}

/// Who is in the room, in the words a teacher would use out loud. "ELs in the
/// room" rather than "english_learners", and the two are deliberately
/// separate phrases because they are separate things.
function makeupPhrases(makeup: string[]): string[] {
  const out: string[] = []
  if (makeup.includes('inclusion')) out.push('SPED/504 in the room')
  if (makeup.includes('english_learners')) out.push('ELs in the room')
  return out
}

// --- validation ---

export function isValidGradeBand(value: unknown): value is GradeBand {
  return typeof value === 'string' && (GRADE_BANDS as readonly string[]).includes(value)
}

/// Keeps only recognized makeup values, de-duplicated and in the canonical
/// order, so a client cannot store junk or the same value twice.
export function normalizeClassMakeup(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return CLASS_MAKEUP_VALUES.filter((known) => value.includes(known))
}

/// Cleans one prep's fields, dropping anything that cannot be true for the
/// band given. A course level from another band (AP in 2nd grade) and a
/// course for a band that has none (elementary) are both discarded rather
/// than stored, because a stored impossibility reappears as a wrong chip the
/// teacher has to notice to fix.
export function normalizeClassContext(input: ClassContextInput): ClassContextInput & { gradeBand: GradeBand } {
  if (!isValidGradeBand(input.gradeBand)) {
    throw new Error(`gradeBand must be one of ${GRADE_BANDS.join(', ')}`)
  }
  const band = input.gradeBand
  const subject = trimmedOrNull(input.subject)
  const offeredCourses = coursesFor(band, subject)
  const course = trimmedOrNull(input.course)
  const offeredLevels = courseLevelsFor(band)
  const level = trimmedOrNull(input.courseLevel)

  return {
    label: trimmedOrNull(input.label),
    gradeBand: band,
    subject,
    // A course needs a subject to belong to and a band that has courses at
    // all. "Other" is accepted as free text, since middle-school course
    // naming varies by district.
    course: course && offeredCourses.length > 0 ? course : null,
    courseLevel: level && offeredLevels.includes(level) ? level : null,
    classMakeup: normalizeClassMakeup(input.classMakeup),
    isDefault: input.isDefault === true,
  }
}

function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// --- inference ---

/// Everything already on record about a teacher's rooms, as the inference
/// sees it. Passed in rather than queried here so the rules are testable
/// without a database.
export type InferenceSources = {
  /// User.gradeLevels — free text, e.g. "9th,10th".
  gradeLevels?: string | null
  /// User.subjects — free text, e.g. "Science".
  subjects?: string | null
  /// Grade/subject pairs off work the teacher has already done, newest first:
  /// lesson plans, assignment reviews and recorded lessons all carry them.
  priorWork?: { gradeLevel?: string | null; subject?: string | null }[]
}

/// A single prep inferred from what the teacher has already told the app, or
/// null when there is genuinely nothing to go on.
///
/// Null is an honest and common answer, and the caller must handle it without
/// blocking: a teacher with nothing on record is asked once, inline, the
/// first time a coach actually needs the room. Seeding them with a guess
/// would present a coin flip as a fact — and because it would be marked
/// confirmed by nobody, it would sit in their profile looking authoritative.
export function inferClassProfile(sources: InferenceSources): ClassContextInput | null {
  const band = inferGradeBand(sources)
  if (!band) return null
  return {
    gradeBand: band,
    subject: inferSubject(sources),
    course: null,
    courseLevel: null,
    classMakeup: [],
    isDefault: true,
  }
}

/// The band, preferring what the teacher wrote about themselves over what
/// their work implies — the profile text is a direct statement, while a
/// lesson plan's grade level is about one plan.
function inferGradeBand(sources: InferenceSources): GradeBand | null {
  const fromProfile = bandFromText(sources.gradeLevels)
  if (fromProfile) return fromProfile
  for (const work of sources.priorWork ?? []) {
    const fromWork = bandFromText(work.gradeLevel)
    if (fromWork) return fromWork
  }
  return null
}

/// Best guess at a band from free text, or null when the text says nothing
/// about a grade.
///
/// Unlike the client's bandFromProfile, this returns null rather than
/// defaulting to 6-8. A default is right when something must be pre-selected
/// on a form; it is wrong when the answer is about to be written to the
/// database and shown back as the teacher's own class.
///
/// Order matters: high school is tested first because "9-12" contains a 1 and
/// a 2, and "K-5" contains a 5. Each branch accepts ordinals, because
/// User.gradeLevels is written as "7th,8th" — ordinals are the canonical form,
/// not an edge case.
export function bandFromText(text: string | null | undefined): GradeBand | null {
  const lower = (text ?? '').toLowerCase()
  if (!lower.trim()) return null
  if (/\b(9|10|11|12)(th)?\b|9-12|high ?school/.test(lower)) return '9-12'
  if (/\bk\b|kindergarten|\b[12](st|nd)?\b|k-2|primary/.test(lower)) return 'K-2'
  if (/\b[3-5](rd|th)?\b|3-5|elementary|k-5/.test(lower)) return '3-5'
  if (/\b[6-8](th)?\b|6-8|middle ?school/.test(lower)) return '6-8'
  return null
}

const SUBJECT_PATTERNS: [RegExp, string][] = [
  [/english|language arts|\bela\b|reading|literature|writing/, 'ELA'],
  [/\bmath|algebra|geometry|calculus|statistic|trigonometry/, 'Math'],
  [/science|biology|chemistry|physics|anatomy/, 'Science'],
  [/history|social studies|civics|government|geography|economics|psychology/, 'History/SS'],
  [/\btech|computer|coding|programming|engineering|robotics/, 'Technology'],
  [/\bart\b|music|theat|drama|band|chorus|dance|film|visual art/, 'Fine Arts'],
]

/// The subject, from the profile text first and then from prior work.
///
/// Returns null rather than a guess when nothing matches. An unrecognized
/// subject is kept verbatim on the client, where there is an "Other" field to
/// put it in; here there is not, and storing "Driver Education" in a column
/// the pickers treat as one of six would render as an empty chip.
export function inferSubject(sources: InferenceSources): string | null {
  const fromProfile = subjectFromText(sources.subjects)
  if (fromProfile) return fromProfile
  for (const work of sources.priorWork ?? []) {
    const fromWork = subjectFromText(work.subject)
    if (fromWork) return fromWork
  }
  return null
}

export function subjectFromText(text: string | null | undefined): string | null {
  const first = text?.split(',')[0]?.trim()
  if (!first) return null
  const lower = first.toLowerCase()
  for (const [pattern, subject] of SUBJECT_PATTERNS) {
    if (pattern.test(lower)) return subject
  }
  return null
}

// --- a debrief contradicting what is stored ---

/// Whether a recorded lesson's own subject disagrees with the prep it was
/// recorded against, which is rule 4's second trigger.
///
/// Only a confident disagreement counts: both sides have to resolve to one of
/// the known subjects, and they have to differ. A recording labelled with
/// something the patterns do not recognize is not evidence that the stored
/// prep is wrong — it is just unlabelled.
export function debriefContradictsPrep(
  debriefSubject: string | null | undefined,
  prep: { subject?: string | null },
): boolean {
  const fromDebrief = subjectFromText(debriefSubject)
  const stored = subjectFromText(prep.subject)
  if (!fromDebrief || !stored) return false
  return fromDebrief !== stored
}
