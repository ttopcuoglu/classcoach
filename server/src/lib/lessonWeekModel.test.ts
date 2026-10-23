import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTemplateRead, sanitizeSections, sectionScope, type TemplateSection } from './lessonTemplateModel.ts'
import {
  buildWeekFillPrompt,
  buildWeekObjectivesPrompt,
  dayLessonContext,
  DEFAULT_WEEK_SECTIONS,
  isUsableWeekFill,
  parseWeekFill,
  parseWeekObjectives,
  sanitizeWeekDays,
  weekFillUserMessage,
  type WeekContext,
  type WeekDay,
} from './lessonWeekModel.ts'

// The prompts and parsers are a pair: a tag renamed in one and not the other
// is a week with no objectives or a grid of empty boxes.

const minutes = (v: unknown) => (typeof v === 'number' && v >= 5 && v <= 240 ? v : null)

test('days keep only weekday names, in weekday order, once each', () => {
  const days = sanitizeWeekDays(
    [{ label: 'Friday', note: ' quiz ' }, { label: 'Monday', minutes: 30 }, { label: 'Monday' }, { label: 'Funday' }, 'x'],
    minutes,
    50,
  )!
  assert.deepEqual(days, [
    { label: 'Monday', minutes: 30, note: null },
    { label: 'Friday', minutes: 50, note: 'quiz' },
  ])
  assert.equal(sanitizeWeekDays([], minutes, 50), null)
  assert.equal(sanitizeWeekDays('Monday', minutes, 50), null)
})

test('the objectives prompt asks for every tag the parser reads', () => {
  const prompt = buildWeekObjectivesPrompt()
  for (const tag of ['day', 'day_number', 'day_objective']) assert.ok(prompt.includes(`<${tag}>`), `missing <${tag}>`)
})

test('objectives come back one per day, and a missing day is null', () => {
  const text = `<day><day_number>2</day_number><day_objective>Students will be able to find zeros.</day_objective></day>
<day><day_number>1</day_number><day_objective>Students will be able to read end behavior.</day_objective></day>
<day><day_number>9</day_number><day_objective>Out of range</day_objective></day>`
  assert.deepEqual(parseWeekObjectives(text, 3), [
    'Students will be able to read end behavior.',
    'Students will be able to find zeros.',
    null,
  ])
})

test('a template read keeps scope, and an unset scope follows the kind', () => {
  const read = parseTemplateRead(`<cadence>weekly</cadence>
<section><section_title>Unit</section_title><section_kind>details</section_kind><section_scope>week</section_scope></section>
<section><section_title>Warm-Up</section_title><section_kind>opening</section_kind><section_scope>day</section_scope></section>
<section><section_title>Big idea</section_title><section_kind>other</section_kind><section_scope>week</section_scope></section>`)
  assert.deepEqual(read.sections.map((s) => [s.title, sectionScope(s)]), [
    ['Unit', 'week'],
    ['Warm-Up', 'day'],
    ['Big idea', 'week'],
  ])
  const unset = sanitizeSections([
    { title: 'Standards', kind: 'standards' },
    { title: 'Homework', kind: 'homework' },
    { title: 'Odd', kind: 'homework', scope: 'sometimes' },
  ])!
  assert.deepEqual(unset.map(sectionScope), ['week', 'day', 'day'])
})

const SECTIONS: TemplateSection[] = [
  { id: 's1', title: 'Unit', kind: 'details', prompt: null, scope: 'week' },
  { id: 's2', title: 'Learning Objective', kind: 'objective', prompt: null, scope: 'day' },
  { id: 's3', title: 'Warm-Up', kind: 'opening', prompt: null, scope: 'day' },
  { id: 's4', title: 'Reflection', kind: 'teacher_fills', prompt: null, scope: 'week' },
]
const DAYS: WeekDay[] = [
  { label: 'Monday', minutes: 50, note: null, objective: 'Students will be able to read end behavior.' },
  { label: 'Tuesday', minutes: 50, note: 'quiz', objective: 'Students will be able to show what they know on a quiz.' },
]
const CONTEXT: WeekContext = {
  goal: 'Key values of polynomial functions',
  subject: 'Algebra 2',
  gradeLevel: '11th',
  unitName: null,
  essentialQuestion: null,
  standard: null,
  additionalContext: null,
  sourceMaterial: null,
}

test('the fill prompt asks for every tag the parser reads', () => {
  const prompt = buildWeekFillPrompt()
  for (const tag of ['week_field', 'day', 'day_number', 'field', 'field_id', 'content']) assert.ok(prompt.includes(`<${tag}>`), `missing <${tag}>`)
})

test('the fill message splits week and day boxes and never sends teacher-fills', () => {
  const message = weekFillUserMessage(CONTEXT, DAYS, SECTIONS)
  assert.match(message, /Week boxes \(filled once\):\n- id s1:/)
  assert.match(message, /Day boxes \(filled for each day\):\n- id s2:[^\n]*\n- id s3:/)
  assert.ok(!message.includes('id s4'))
  assert.ok(message.includes("2. Tuesday, 50 minutes: Students will be able to show what they know on a quiz. (the teacher's note: quiz)"))
})

test('a fill keeps the template order, the checked objective, and blank teacher boxes', () => {
  const filled = parseWeekFill(
    `<week_field><field_id>s1</field_id><content>Polynomials</content></week_field>
<week_field><field_id>s4</field_id><content>Should be blank</content></week_field>
<day><day_number>1</day_number>
<field><field_id>s2</field_id><content>A rewritten objective</content></field>
<field><field_id>s3</field_id><content>Match four graphs to equations.</content></field>
<field><field_id>s1</field_id><content>A day field must not become the week's</content></field>
</day>
<day><day_number>2</day_number></day>`,
    SECTIONS,
    DAYS,
  )
  assert.deepEqual(filled.shared.map((s) => [s.title, s.text]), [
    ['Unit', 'Polynomials'],
    ['Reflection', ''],
  ])
  assert.deepEqual(filled.days.map((d) => [d.label, d.sections.map((s) => s.text)]), [
    ['Monday', ['Students will be able to read end behavior.', 'Match four graphs to equations.']],
    ['Tuesday', ['Students will be able to show what they know on a quiz.', '']],
  ])
  assert.ok(isUsableWeekFill(filled))
  assert.ok(!isUsableWeekFill(parseWeekFill('nothing', SECTIONS, DAYS)), 'objectives alone are not a filled week')
})

test("Wivoza's own weekly layout has week and day boxes", () => {
  assert.ok(DEFAULT_WEEK_SECTIONS.some((s) => sectionScope(s) === 'week'))
  assert.ok(DEFAULT_WEEK_SECTIONS.some((s) => s.kind === 'objective' && sectionScope(s) === 'day'))
})

test("a day opened as a lesson is told the week around it and that day's plan", () => {
  const context = dayLessonContext(CONTEXT, {
    days: DAYS,
    content: {
      templateId: null,
      templateName: 'x',
      shared: [],
      days: [
        { label: 'Monday', sections: [{ id: 's3', title: 'Warm-Up', kind: 'opening', text: 'Match four graphs.' }] },
        { label: 'Tuesday', sections: [] },
      ],
    },
  }, 0)
  assert.ok(context.includes("Monday's lesson in a week on: Key values of polynomial functions"))
  assert.ok(context.includes('→ Monday: Students will be able to read end behavior.'))
  assert.ok(context.includes('Tuesday: Students will be able to show what they know on a quiz.'))
  assert.ok(context.includes('Warm-Up: Match four graphs.'))
})
