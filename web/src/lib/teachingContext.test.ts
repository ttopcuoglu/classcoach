import { expect, test } from 'vitest'
import {
  CLASS_MAKEUP,
  COURSE_LEVELS_BY_BAND,
  GRADE_BANDS,
  bandFromProfile,
  courseLevelsFor,
  coursesFor,
  subjectFromProfile,
} from './teachingContext'

// Class context is moving off every screen and into the teacher profile as a
// list of preps, and the consolidation promises to seed that list by inference
// rather than making teachers retype what the app already knows. These two
// functions ARE that inference — they turn the free-text `gradeLevels` and
// `subjects` on an existing profile into real band and subject values.
//
// They have no test today, and a wrong answer here is close to invisible: the
// seeded prep looks plausible, the teacher accepts the "Saved to your class"
// confirmation without reading it, and every scenario and review they get
// afterwards is quietly pitched at the wrong room.

test('the four bands are exactly these, in this order', () => {
  expect(GRADE_BANDS).toEqual(['K-2', '3-5', '6-8', '9-12'])
})

test('a high-school profile infers 9-12', () => {
  for (const text of ['9th,10th', '11th', '12', 'High School', 'grades 9-12']) {
    expect(bandFromProfile(text), `"${text}"`).toBe('9-12')
  }
})

test('an early-elementary profile infers K-2', () => {
  for (const text of ['K', 'Kindergarten', '1st', '2nd', 'K-2', 'primary']) {
    expect(bandFromProfile(text), `"${text}"`).toBe('K-2')
  }
})

test('an upper-elementary profile infers 3-5', () => {
  for (const text of ['3rd', '4th', '5th', '3-5', 'elementary']) {
    expect(bandFromProfile(text), `"${text}"`).toBe('3-5')
  }
})

test('a middle-school profile infers 6-8', () => {
  for (const text of ['6th', '7th,8th', '6-8']) {
    expect(bandFromProfile(text), `"${text}"`).toBe('6-8')
  }
})

// Nothing to infer from is the commonest case on an older account, and the
// seeded prep still has to name a band. 6-8 is the deliberate middle default,
// not an accident — pinned so a future edit has to choose it on purpose.
test('an empty or unreadable profile falls back to 6-8 rather than guessing high or low', () => {
  expect(bandFromProfile(null)).toBe('6-8')
  expect(bandFromProfile(undefined)).toBe('6-8')
  expect(bandFromProfile('')).toBe('6-8')
  expect(bandFromProfile('all grades')).toBe('6-8')
})

// High school is checked before elementary on purpose: "9-12" contains a "1"
// and a "2", and "K-5" contains a "5". Reordering those branches silently
// sends high-school teachers to K-2.
test('a band string containing digits from another band is not misread', () => {
  expect(bandFromProfile('9-12')).toBe('9-12')
  expect(bandFromProfile('K-5')).toBe('K-2')
})

test('a subject that is already one of the offered six is kept as-is', () => {
  expect(subjectFromProfile('Math')).toBe('Math')
  expect(subjectFromProfile('Science')).toBe('Science')
  expect(subjectFromProfile('History/SS')).toBe('History/SS')
})

test('subject matching ignores case', () => {
  expect(subjectFromProfile('math')).toBe('Math')
  expect(subjectFromProfile('FINE ARTS')).toBe('Fine Arts')
})

// What teachers actually type. Each of these has to land on a real chip,
// because an unmatched value falls through to the free-text "Other" box and a
// seeded prep that says "Other" has inferred nothing.
test('the subjects teachers actually write map onto the offered list', () => {
  expect(subjectFromProfile('English Language Arts')).toBe('ELA')
  expect(subjectFromProfile('Reading')).toBe('ELA')
  expect(subjectFromProfile('Algebra 2')).toBe('Math')
  expect(subjectFromProfile('Biology')).toBe('Science')
  expect(subjectFromProfile('Social Studies')).toBe('History/SS')
  expect(subjectFromProfile('Robotics')).toBe('Technology')
  expect(subjectFromProfile('Band')).toBe('Fine Arts')
})

// "Computer Science" is listed under BOTH 9-12 Science and Technology in
// COURSES_BY_BAND_AND_SUBJECT, so there is no single right answer — the
// Science branch simply runs first. Pinned as the known, deliberate tie-break
// rather than left to be rediscovered: a teacher whose prep is seeded as
// Science can change it, and either answer offers Computer Science as a course.
test('Computer Science resolves to Science, the first of the two subjects that claim it', () => {
  expect(subjectFromProfile('Computer Science')).toBe('Science')
})

test('only the first of several subjects is inferred', () => {
  expect(subjectFromProfile('Math,Science')).toBe('Math')
})

test('an unrecognized subject is kept verbatim for the Other box, not dropped', () => {
  expect(subjectFromProfile('Driver Education')).toBe('Driver Education')
})

test('no subject on the profile infers nothing rather than a default', () => {
  expect(subjectFromProfile(null)).toBeUndefined()
  expect(subjectFromProfile(undefined)).toBeUndefined()
  expect(subjectFromProfile('')).toBeUndefined()
  expect(subjectFromProfile('  ')).toBeUndefined()
})

// AP is a College Board programme and does not exist before high school;
// honors tracks start around 6th grade. A 2nd grade teacher could once pick
// AP, and the band-aware lists are what fixed it.
test('course levels stay band-appropriate', () => {
  expect(courseLevelsFor('9-12')).toEqual(['AP', 'Honors', 'Regular'])
  expect(courseLevelsFor('6-8')).toEqual(['Honors', 'Regular'])
  expect(courseLevelsFor('K-2')).toEqual(['Regular'])
  expect(courseLevelsFor('3-5')).toEqual(['Regular'])
})

test('every band has a level list, so no band can render an empty level row', () => {
  for (const band of GRADE_BANDS) {
    expect(COURSE_LEVELS_BY_BAND[band]?.length, `${band} has no levels`).toBeGreaterThan(0)
  }
})

test('an unknown band offers no levels rather than high-school ones', () => {
  expect(courseLevelsFor('K-5')).toEqual([])
  expect(courseLevelsFor(null)).toEqual([])
})

// Elementary has no courses to name — one teacher owns every subject — so the
// course row must come back empty rather than borrowing another band's list.
test('only departmentalised bands have courses', () => {
  expect(coursesFor('9-12', 'Science')).toContain('Biology')
  expect(coursesFor('6-8', 'Math')).toContain('Pre-Algebra')
  expect(coursesFor('K-2', 'Math')).toEqual([])
  expect(coursesFor('3-5', 'Math')).toEqual([])
})

test('courses need both a band and a subject before there is anything to offer', () => {
  expect(coursesFor('9-12', null)).toEqual([])
  expect(coursesFor(null, 'Math')).toEqual([])
  expect(coursesFor('9-12', 'Not A Subject')).toEqual([])
})

// Who is in the room is kept apart from how the course is tracked, because
// SPED/504 sits under IDEA and English learners under different law entirely.
// Collapsing them into one chip would teach the coach to treat an English
// learner as though they had a learning disability.
test('class makeup stays two independent values, separate from course level', () => {
  expect(CLASS_MAKEUP.map((m) => m.value)).toEqual(['inclusion', 'english_learners'])
  for (const band of GRADE_BANDS) {
    expect(COURSE_LEVELS_BY_BAND[band]).not.toContain('inclusion')
  }
})
