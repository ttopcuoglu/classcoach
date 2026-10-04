import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  bandFromText,
  debriefContradictsPrep,
  describeClassContext,
  inferClassProfile,
  inferSubject,
  isValidGradeBand,
  needsReconfirmation,
  normalizeClassContext,
  normalizeClassMakeup,
  schoolYearOf,
  subjectFromText,
} from './classProfile.ts'

// Class context is the one thing in this refactor that is written to the
// database on the teacher's behalf, from a guess, and then shown back to them
// as a statement about their own classroom. That makes two failures possible
// that nothing else here can produce:
//
//   * A confident wrong guess. "Grades 6-8 · Science" sitting in a 10th grade
//     chemistry teacher's profile, never confirmed by anyone, quietly pitching
//     every scenario and every review at the wrong room. The rule that
//     prevents it is that inference returns NULL rather than defaulting, and
//     an inferred row is never marked confirmed.
//   * A blocked action. The brief's first rule is that missing context never
//     blocks anything, so every function here has to return something usable
//     for a teacher who has filled in nothing at all.

// --- inference returns nothing rather than guessing ---

// This is the difference between this inference and the client's
// bandFromProfile, which defaults to 6-8 because a form needs something
// pre-selected. Writing that default to the database and showing it back as
// the teacher's class is a different act entirely.
test('a teacher with nothing on record gets no prep rather than a default one', () => {
  assert.equal(inferClassProfile({}), null)
  assert.equal(inferClassProfile({ gradeLevels: null, subjects: null }), null)
  assert.equal(inferClassProfile({ gradeLevels: '   ' }), null)
  assert.equal(inferClassProfile({ subjects: 'Science' }), null, 'a subject alone is not a room')
})

test('an unreadable grade text infers nothing, even when it is not empty', () => {
  assert.equal(bandFromText('all grades'), null)
  assert.equal(bandFromText('everyone'), null)
  assert.equal(inferClassProfile({ gradeLevels: 'all grades' }), null)
})

test('an inferred prep is the default prep and is never pre-confirmed', () => {
  const inferred = inferClassProfile({ gradeLevels: '9th,10th', subjects: 'Biology' })
  assert.ok(inferred)
  assert.equal(inferred.gradeBand, '9-12')
  assert.equal(inferred.subject, 'Science')
  assert.equal(inferred.isDefault, true)
  // Course and level are never inferred: there is no honest basis for either,
  // and a wrong level ("AP") changes the coaching materially.
  assert.equal(inferred.course, null)
  assert.equal(inferred.courseLevel, null)
  assert.deepEqual(inferred.classMakeup, [])
})

// The bug found in step 0, pinned on this side too: ordinals are the
// canonical form of User.gradeLevels, so every band has to accept them.
test('high-school ordinals infer 9-12, not the middle-school fallback', () => {
  for (const text of ['9th', '10th', '11th', '12th', '9th,10th', '11th,12th']) {
    assert.equal(bandFromText(text), '9-12', `"${text}"`)
  }
})

test('every band is reachable from the ordinals teachers actually write', () => {
  assert.equal(bandFromText('K,1st'), 'K-2')
  assert.equal(bandFromText('2nd'), 'K-2')
  assert.equal(bandFromText('3rd,4th'), '3-5')
  assert.equal(bandFromText('5th'), '3-5')
  assert.equal(bandFromText('6th,7th'), '6-8')
  assert.equal(bandFromText('8th'), '6-8')
})

// High school is tested before the narrower bands because "9-12" contains a 1
// and a 2, and "K-5" contains a 5. Reordering silently sends high-school
// teachers to K-2.
test('a band string containing digits from another band is not misread', () => {
  assert.equal(bandFromText('9-12'), '9-12')
  assert.equal(bandFromText('K-5'), 'K-2')
  assert.equal(bandFromText('High School'), '9-12')
  assert.equal(bandFromText('middle school'), '6-8')
})

// Prior work is the brief's richer seed — plans, assignments and recordings
// all carry a grade and a subject.
test('a teacher who never filled in a profile is inferred from work they have done', () => {
  const inferred = inferClassProfile({
    priorWork: [{ gradeLevel: '11th', subject: 'Chemistry' }],
  })
  assert.ok(inferred)
  assert.equal(inferred.gradeBand, '9-12')
  assert.equal(inferred.subject, 'Science')
})

// The teacher's own statement about themselves outranks what one lesson plan
// implies — a 9-12 teacher may well have made a plan labelled 7th grade.
test('what the teacher said about themselves beats what one piece of work implies', () => {
  const inferred = inferClassProfile({
    gradeLevels: '9th',
    subjects: 'Math',
    priorWork: [{ gradeLevel: '7th', subject: 'Science' }],
  })
  assert.ok(inferred)
  assert.equal(inferred.gradeBand, '9-12')
  assert.equal(inferred.subject, 'Math')
})

test('prior work is read newest first and the first readable answer wins', () => {
  const inferred = inferClassProfile({
    priorWork: [{ gradeLevel: 'unlabelled' }, { gradeLevel: '4th', subject: 'Reading' }],
  })
  assert.ok(inferred)
  assert.equal(inferred.gradeBand, '3-5')
  assert.equal(inferred.subject, 'ELA')
})

// A subject the six-way list cannot hold is left null rather than stored —
// the client has an "Other" free-text field for it, this column does not, and
// an unmatched value renders as an empty chip.
test('an unrecognized subject is left unset rather than stored as junk', () => {
  assert.equal(subjectFromText('Driver Education'), null)
  assert.equal(subjectFromText('Advisory'), null)
  assert.equal(inferSubject({ subjects: 'Driver Education' }), null)
})

test('the subjects teachers actually write map onto the offered list', () => {
  assert.equal(subjectFromText('English Language Arts'), 'ELA')
  assert.equal(subjectFromText('Algebra 2'), 'Math')
  assert.equal(subjectFromText('Biology'), 'Science')
  assert.equal(subjectFromText('Social Studies'), 'History/SS')
  assert.equal(subjectFromText('Robotics'), 'Technology')
  assert.equal(subjectFromText('Band'), 'Fine Arts')
})

test('only the first of several subjects is inferred', () => {
  assert.equal(subjectFromText('Math,Science'), 'Math')
})

test('nothing to read infers no subject', () => {
  assert.equal(subjectFromText(null), null)
  assert.equal(subjectFromText(''), null)
  assert.equal(subjectFromText('  '), null)
})

// --- the one editable line ---

// The line in the brief is "Grades 9–12 · Biology · Honors · ELs in the room".
test('a fully specified prep renders exactly the standard line', () => {
  assert.equal(
    describeClassContext({
      gradeBand: '9-12',
      subject: 'Science',
      course: 'Biology',
      courseLevel: 'Honors',
      classMakeup: ['english_learners'],
    }),
    'Grades 9–12 · Biology · Honors · ELs in the room',
  )
})

// A teacher who has given only a band must still see a sensible line, not a
// row of separators — this is the "never block, never look broken" rule
// applied to presentation.
test('a prep with only a band renders as just the band', () => {
  assert.equal(describeClassContext({ gradeBand: '6-8' }), 'Grades 6–8')
  assert.equal(describeClassContext({ gradeBand: 'K-2', classMakeup: [] }), 'Grades K–2')
})

// The course implies its subject, so showing both reads as a duplication.
test('a course replaces the subject rather than appearing beside it', () => {
  assert.equal(
    describeClassContext({ gradeBand: '9-12', subject: 'Math', course: 'Calculus' }),
    'Grades 9–12 · Calculus',
  )
  assert.equal(describeClassContext({ gradeBand: '9-12', subject: 'Math' }), 'Grades 9–12 · Math')
})

// The two makeup values are separate phrases because they are separate
// things — one is a disability framework, the other is language acquisition.
test('both kinds of who-is-in-the-room are named, separately', () => {
  assert.equal(
    describeClassContext({ gradeBand: '9-12', classMakeup: ['inclusion', 'english_learners'] }),
    'Grades 9–12 · SPED/504 in the room · ELs in the room',
  )
  assert.equal(
    describeClassContext({ gradeBand: '6-8', classMakeup: ['inclusion'] }),
    'Grades 6–8 · SPED/504 in the room',
  )
})

test('an unrecognized band is still shown rather than dropped', () => {
  assert.equal(describeClassContext({ gradeBand: 'K-5' }), 'K-5')
})

// --- validation ---

test('only the four real bands validate', () => {
  for (const band of ['K-2', '3-5', '6-8', '9-12']) assert.equal(isValidGradeBand(band), true, band)
  for (const band of ['K-5', 'k-2', '', 'Grades 9-12', null, undefined, 9]) {
    assert.equal(isValidGradeBand(band), false, String(band))
  }
})

test('a prep without a valid band is refused rather than stored', () => {
  assert.throws(() => normalizeClassContext({ gradeBand: 'K-5' }), /gradeBand must be one of/)
  assert.throws(() => normalizeClassContext({ gradeBand: '' }), /gradeBand must be one of/)
})

test('makeup values are filtered to the known two, de-duplicated and ordered', () => {
  assert.deepEqual(normalizeClassMakeup(['english_learners', 'inclusion']), ['inclusion', 'english_learners'])
  assert.deepEqual(normalizeClassMakeup(['inclusion', 'inclusion']), ['inclusion'])
  assert.deepEqual(normalizeClassMakeup(['gifted', 'inclusion']), ['inclusion'])
  assert.deepEqual(normalizeClassMakeup('inclusion'), [])
  assert.deepEqual(normalizeClassMakeup(null), [])
})

// A stored impossibility reappears as a wrong chip the teacher has to notice
// in order to fix, so it is discarded on the way in instead.
test('a course level from another band is discarded, not stored', () => {
  assert.equal(normalizeClassContext({ gradeBand: 'K-2', courseLevel: 'AP' }).courseLevel, null)
  assert.equal(normalizeClassContext({ gradeBand: '6-8', courseLevel: 'AP' }).courseLevel, null)
  assert.equal(normalizeClassContext({ gradeBand: '9-12', courseLevel: 'AP' }).courseLevel, 'AP')
  assert.equal(normalizeClassContext({ gradeBand: '6-8', courseLevel: 'Honors' }).courseLevel, 'Honors')
})

// Elementary has no courses to name — one teacher owns every subject.
test('a course is discarded for a band that has none', () => {
  assert.equal(
    normalizeClassContext({ gradeBand: 'K-2', subject: 'Math', course: 'Algebra 1' }).course,
    null,
  )
  assert.equal(
    normalizeClassContext({ gradeBand: '9-12', subject: 'Math', course: 'Algebra 1' }).course,
    'Algebra 1',
  )
})

test('a course with no subject to belong to is discarded', () => {
  assert.equal(normalizeClassContext({ gradeBand: '9-12', course: 'Biology' }).course, null)
})

// Middle-school course naming varies by district, so free text has to survive
// normalization rather than being rejected for not matching the shortcut list.
test('a course a district names its own way is kept', () => {
  assert.equal(
    normalizeClassContext({ gradeBand: '6-8', subject: 'Math', course: 'Course 2' }).course,
    'Course 2',
  )
})

test('blank and whitespace-only fields are stored as null, not as empty strings', () => {
  const normalized = normalizeClassContext({
    gradeBand: '9-12',
    label: '   ',
    subject: '',
    course: '  ',
    courseLevel: '',
  })
  assert.equal(normalized.label, null)
  assert.equal(normalized.subject, null)
  assert.equal(normalized.course, null)
  assert.equal(normalized.courseLevel, null)
})

test('a label is trimmed rather than stored with its padding', () => {
  assert.equal(normalizeClassContext({ gradeBand: '9-12', label: '  3rd period Bio  ' }).label, '3rd period Bio')
})

test('isDefault has to be asked for explicitly', () => {
  assert.equal(normalizeClassContext({ gradeBand: '9-12' }).isDefault, false)
  assert.equal(normalizeClassContext({ gradeBand: '9-12', isDefault: true }).isDefault, true)
  assert.equal(normalizeClassContext({ gradeBand: '9-12', isDefault: 'yes' as never }).isDefault, false)
})

// --- school year and re-confirmation ---

test('the school year turns over in August, not in January', () => {
  assert.equal(schoolYearOf(new Date('2026-08-01T00:00:00Z')), '2026-2027')
  assert.equal(schoolYearOf(new Date('2026-12-31T00:00:00Z')), '2026-2027')
  assert.equal(schoolYearOf(new Date('2027-01-01T00:00:00Z')), '2026-2027')
  assert.equal(schoolYearOf(new Date('2027-07-31T00:00:00Z')), '2026-2027')
  assert.equal(schoolYearOf(new Date('2027-08-01T00:00:00Z')), '2027-2028')
})

test('an unconfirmed prep always needs confirming', () => {
  const now = new Date('2026-10-03T00:00:00Z')
  assert.equal(needsReconfirmation({ confirmed: false, schoolYear: null }, now), true)
  // Even if it carries this year's label — an inferred row can be stamped
  // with the year it was created without anyone having agreed to it.
  assert.equal(needsReconfirmation({ confirmed: false, schoolYear: '2026-2027' }, now), true)
})

// Re-asking in October about something settled in September is exactly the
// nagging this feature removes.
test('a prep confirmed for this school year is left alone', () => {
  const now = new Date('2026-10-03T00:00:00Z')
  assert.equal(needsReconfirmation({ confirmed: true, schoolYear: '2026-2027' }, now), false)
})

test('a new school year asks again', () => {
  assert.equal(
    needsReconfirmation({ confirmed: true, schoolYear: '2025-2026' }, new Date('2026-09-01T00:00:00Z')),
    true,
  )
  // September of the same year it was confirmed in does not.
  assert.equal(
    needsReconfirmation({ confirmed: true, schoolYear: '2026-2027' }, new Date('2026-09-01T00:00:00Z')),
    false,
  )
})

test('a confirmed prep with no year recorded asks again', () => {
  assert.equal(
    needsReconfirmation({ confirmed: true, schoolYear: null }, new Date('2026-10-03T00:00:00Z')),
    true,
  )
})

// --- a debrief contradicting what is stored ---

test('a recording in a different subject contradicts the stored prep', () => {
  assert.equal(debriefContradictsPrep('Biology', { subject: 'Math' }), true)
  assert.equal(debriefContradictsPrep('Algebra 2', { subject: 'Science' }), true)
})

test('a recording in the stored subject does not', () => {
  assert.equal(debriefContradictsPrep('Biology', { subject: 'Science' }), false)
  assert.equal(debriefContradictsPrep('Chemistry', { subject: 'Biology' }), false)
})

// An unreadable label is not evidence of anything. Treating it as a
// contradiction would nag a teacher every time they left the subject blank.
test('an unlabelled or unrecognized recording never counts as a contradiction', () => {
  assert.equal(debriefContradictsPrep(null, { subject: 'Science' }), false)
  assert.equal(debriefContradictsPrep('', { subject: 'Science' }), false)
  assert.equal(debriefContradictsPrep('Period 3', { subject: 'Science' }), false)
  assert.equal(debriefContradictsPrep('Biology', { subject: null }), false)
  assert.equal(debriefContradictsPrep('Biology', {}), false)
})
