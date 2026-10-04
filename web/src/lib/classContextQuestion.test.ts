import { expect, test } from 'vitest'
import type { ClassContext } from './api'
import { nextClassContextQuestion, type ClassContextField } from './classContextQuestion'

// The rule being enforced is "ask ONE question". The five-field panel this
// replaces is what made every surface feel like a form, and a coach that asks
// three questions in a row has rebuilt that form inside the conversation —
// which is harder to escape than the panel was, because it is mid-sentence.
//
// The other half is that an unanswered question must never block anything, so
// "no question" has to be a first-class, common answer rather than an error
// state. Most of these tests are about the cases where the right behavior is
// to stay quiet.

function prep(over: Partial<ClassContext> = {}): ClassContext {
  return {
    id: 'c1',
    label: null,
    gradeBand: '9-12',
    subject: null,
    course: null,
    courseLevel: null,
    classMakeup: [],
    isDefault: true,
    confirmed: false,
    inferred: false,
    schoolYear: null,
    line: 'Grades 9–12',
    needsConfirmation: true,
    ...over,
  }
}

const ALL: ClassContextField[] = ['gradeBand', 'subject', 'course', 'courseLevel', 'classMakeup']

test('only one question is ever returned, even when everything is missing', () => {
  const question = nextClassContextQuestion(null, ALL)
  expect(question).not.toBeNull()
  expect(question!.field).toBe('gradeBand')
})

// The order is the order the fields narrow each other: a subject means little
// without a band, a course nothing without a subject.
test('questions are asked in narrowing order', () => {
  expect(nextClassContextQuestion(null, ALL)!.field).toBe('gradeBand')
  expect(nextClassContextQuestion(prep(), ALL)!.field).toBe('subject')
  expect(nextClassContextQuestion(prep({ subject: 'Science' }), ALL)!.field).toBe('course')
  expect(nextClassContextQuestion(prep({ subject: 'Science', course: 'Biology' }), ALL)!.field).toBe(
    'courseLevel',
  )
})

// This is the rule that stops the question from being a form: the coach asks
// only for what the work in front of it needs.
test('a coach that does not need a field never asks for it', () => {
  // A parent email does not get better for knowing the course.
  const question = nextClassContextQuestion(prep({ subject: null }), ['gradeBand'])
  expect(question).toBeNull()
})

test('only the needed field is asked, even when earlier ones are also missing', () => {
  const question = nextClassContextQuestion(prep({ gradeBand: '9-12' }), ['subject'])
  expect(question!.field).toBe('subject')
})

// --- staying quiet ---

test('nothing is asked when everything needed is already known', () => {
  const full = prep({ subject: 'Science', course: 'Biology', courseLevel: 'Honors', confirmed: true })
  expect(nextClassContextQuestion(full, ALL)).toBeNull()
})

test('nothing is asked when the coach needs nothing', () => {
  expect(nextClassContextQuestion(null, [])).toBeNull()
  expect(nextClassContextQuestion(prep(), [])).toBeNull()
})

// Asking a 2nd grade teacher which course they teach has no right answer —
// one teacher owns every subject and there is nothing to disambiguate.
test('a course is never asked for in a band that has none', () => {
  const elementary = prep({ gradeBand: 'K-2', subject: 'Math' })
  const question = nextClassContextQuestion(elementary, ['course'])
  expect(question).toBeNull()
})

test('a course is never asked for before the subject it would belong to', () => {
  expect(nextClassContextQuestion(prep({ subject: null }), ['course'])).toBeNull()
})

// K-2 and 3-5 offer only "Regular", and a single option is not a choice.
test('a level is never asked for in a band that offers only one', () => {
  expect(nextClassContextQuestion(prep({ gradeBand: 'K-2' }), ['courseLevel'])).toBeNull()
  expect(nextClassContextQuestion(prep({ gradeBand: '3-5' }), ['courseLevel'])).toBeNull()
  expect(nextClassContextQuestion(prep({ gradeBand: '6-8' }), ['courseLevel'])!.field).toBe('courseLevel')
  expect(nextClassContextQuestion(prep({ gradeBand: '9-12' }), ['courseLevel'])!.field).toBe('courseLevel')
})

test('a level is never asked for with no band to scope it', () => {
  expect(nextClassContextQuestion(null, ['courseLevel'])).toBeNull()
})

// An empty makeup list means either "nobody" or "never asked", and those are
// different. Treating empty as answered would never ask; treating it as
// unanswered forever would ask a teacher who genuinely has neither, every
// time. Confirmation is what separates them.
test('who-is-in-the-room is asked once and then left alone', () => {
  const unconfirmed = prep({ subject: 'Science', course: 'Biology', courseLevel: 'Honors' })
  expect(nextClassContextQuestion(unconfirmed, ['classMakeup'])!.field).toBe('classMakeup')
  const confirmed = prep({ ...unconfirmed, confirmed: true })
  expect(nextClassContextQuestion(confirmed, ['classMakeup'])).toBeNull()
})

test('a teacher who answered "neither" is not asked again', () => {
  const answered = prep({ classMakeup: [], confirmed: true })
  expect(nextClassContextQuestion(answered, ['classMakeup'])).toBeNull()
})

// --- the chips ---

test('every question comes with chips to answer it', () => {
  for (const field of ALL) {
    const source = prep({ subject: 'Science', gradeBand: '9-12' })
    const question = nextClassContextQuestion(source, [field])
    if (!question) continue
    expect(question.options.length, `${field} has no options`).toBeGreaterThan(0)
    for (const option of question.options) {
      expect(option.value, `${field} option has no value`).toBeTruthy()
      expect(option.label, `${field} option has no label`).toBeTruthy()
    }
  }
})

test('the question is phrased for a teacher, not named after a column', () => {
  const question = nextClassContextQuestion(null, ['gradeBand'])!
  expect(question.question).toBe('What grades is this?')
  expect(question.question).not.toContain('gradeBand')
})

test('course chips are the courses that band and subject actually offer', () => {
  const question = nextClassContextQuestion(prep({ gradeBand: '9-12', subject: 'Science' }), ['course'])!
  expect(question.options.map((o) => o.value)).toContain('Biology')
  expect(question.options.map((o) => o.value)).not.toContain('Algebra 1')
})

test('level chips are band-appropriate, so AP never appears below high school', () => {
  const middle = nextClassContextQuestion(prep({ gradeBand: '6-8' }), ['courseLevel'])!
  expect(middle.options.map((o) => o.value)).toEqual(['Honors', 'Regular'])
  const high = nextClassContextQuestion(prep({ gradeBand: '9-12' }), ['courseLevel'])!
  expect(high.options.map((o) => o.value)).toEqual(['AP', 'Honors', 'Regular'])
})

// Who's-in-the-room is the only field where more than one answer is true at
// once: a co-taught section with English learners is both.
test('only who-is-in-the-room allows more than one answer', () => {
  expect(nextClassContextQuestion(prep({ confirmed: false }), ['classMakeup'])!.multi).toBe(true)
  expect(nextClassContextQuestion(null, ['gradeBand'])!.multi).toBe(false)
  expect(nextClassContextQuestion(prep(), ['subject'])!.multi).toBe(false)
})

// A blank string is not an answer — it is what an "Other" field looks like
// before anyone types in it.
test('a blank stored value counts as unanswered', () => {
  expect(nextClassContextQuestion(prep({ subject: '   ' }), ['subject'])!.field).toBe('subject')
  expect(nextClassContextQuestion(prep({ subject: '' }), ['subject'])!.field).toBe('subject')
})
