import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildLayoutPrompt,
  isUsableLayout,
  layoutSourceKey,
  layoutUserMessage,
  parseLayout,
  parseTemplateRead,
  READ_TEMPLATE_PROMPT,
  sanitizeSections,
  SECTION_KINDS,
  type TemplateSection,
} from './lessonTemplateModel.ts'

// The prompts and parsers are a pair: a tag renamed in one and not the other
// is a template read with no sections, or a lesson laid out with every box
// empty, and nothing says why.

const READ = `<template_name>Maple Ridge daily lesson plan</template_name>
<cadence>daily</cadence>
<section>
<section_title>Lesson details</section_title>
<section_kind>details</section_kind>
<section_prompt></section_prompt>
</section>
<section>
<section_title>Learning Target</section_title>
<section_kind>objective</section_kind>
<section_prompt>Written as an "I can" statement</section_prompt>
</section>
<section>
<section_title>Do Now</section_title>
<section_kind>Opening</section_kind>
<section_prompt></section_prompt>
</section>
<section>
<section_title>IEP / 504 Accommodations</section_title>
<section_kind>teacher_fills</section_kind>
<section_prompt>List students and accommodations</section_prompt>
</section>
<section>
<section_title>Something odd</section_title>
<section_kind>not_a_kind</section_kind>
<section_prompt></section_prompt>
</section>
<note>none</note>`

test('the read prompt asks for every tag the parser reads, and lists every kind', () => {
  for (const tag of ['template_name', 'cadence', 'section', 'section_title', 'section_kind', 'section_prompt', 'note']) {
    assert.ok(READ_TEMPLATE_PROMPT.includes(`<${tag}>`), `read prompt is missing <${tag}>`)
  }
  for (const kind of SECTION_KINDS) {
    assert.ok(READ_TEMPLATE_PROMPT.includes(`- ${kind}:`), `read prompt never offers the kind ${kind}`)
  }
})

test('a template read keeps the form order and titles, and normalises kinds', () => {
  const read = parseTemplateRead(READ)
  assert.equal(read.name, 'Maple Ridge daily lesson plan')
  assert.equal(read.cadence, 'daily')
  assert.equal(read.note, null)
  assert.deepEqual(
    read.sections.map((s) => [s.title, s.kind]),
    [
      ['Lesson details', 'details'],
      ['Learning Target', 'objective'],
      ['Do Now', 'opening'],
      ['IEP / 504 Accommodations', 'teacher_fills'],
      ['Something odd', 'other'],
    ],
  )
  assert.equal(read.sections[1].prompt, 'Written as an "I can" statement')
  assert.equal(read.sections[2].prompt, null)
  assert.equal(new Set(read.sections.map((s) => s.id)).size, read.sections.length, 'section ids must be unique')
})

test('a weekly form is read as weekly, and a real note is kept', () => {
  const read = parseTemplateRead('<cadence>Weekly</cadence><section><section_title>Objective</section_title><section_kind>objective</section_kind></section><note>The Friday column was cut off.</note>')
  assert.equal(read.cadence, 'weekly')
  assert.equal(read.note, 'The Friday column was cut off.')
})

test('sections from the client keep their ids, and bad ones are repaired', () => {
  const sections = sanitizeSections([
    { id: 's1', title: '  Objective ', kind: 'objective' },
    { id: 's1', title: 'Duplicate id', kind: 'checks' },
    { id: 'DROP TABLE', title: 'Bad id', kind: 'homework' },
    { title: '' },
    'not an object',
  ])!
  assert.equal(sections.length, 3)
  assert.equal(sections[0].id, 's1')
  assert.equal(sections[0].title, 'Objective')
  assert.notEqual(sections[1].id, 's1')
  assert.match(sections[2].id, /^s\d+$/)
  assert.equal(sanitizeSections([]), null)
  assert.equal(sanitizeSections('nope'), null)
})

const SECTIONS: TemplateSection[] = [
  { id: 's1', title: 'Learning Target', kind: 'objective', prompt: null },
  { id: 's2', title: 'Do Now', kind: 'opening', prompt: null },
  { id: 's3', title: 'Accommodations', kind: 'teacher_fills', prompt: 'Students by name' },
  { id: 's4', title: 'Exit Ticket', kind: 'exit_ticket', prompt: null },
]

const LESSON = {
  objective: 'Students will be able to explain why a cell needs a membrane.',
  durationMinutes: 45,
  subject: 'Biology',
  gradeLevel: '9th',
  standard: 'HS-LS1-2',
  sequence: [{ minutes: 10, title: 'Launch: the leaking bag', teacher: 'Hold up the bag.', students: 'Predict.' }],
  exitTicket: { task: 'Why does a cell need a membrane?', expected: null, signals: null, nextStep: null },
}

test('the layout prompt asks for every tag the parser reads', () => {
  const prompt = buildLayoutPrompt()
  for (const tag of ['place', 'step_number', 'field', 'field_id', 'content']) assert.ok(prompt.includes(`<${tag}>`), `layout prompt is missing <${tag}>`)
})

test('a teacher-fills section is never sent to the model, and step sections are listed apart', () => {
  const message = layoutUserMessage(LESSON, SECTIONS)
  assert.ok(message.includes('id s1'))
  assert.ok(message.includes('id s4'))
  assert.ok(!message.includes('id s3'), 'teacher-fills section was sent for the model to fill')
  assert.match(message, /Step sections, in the form's order:\n- id s2:/)
  assert.ok(message.includes('Standard (as the teacher gave it): HS-LS1-2'))
  assert.ok(message.includes('Launch: the leaking bag'))
})

test('written sections take the model text; teacher-fills stays blank whatever comes back', () => {
  const laidOut = parseLayout(
    `<place><step_number>1</step_number><field_id>s2</field_id></place>
<field><field_id>s4</field_id><content>Why does a cell need a membrane?</content></field>
<field><field_id>s1</field_id><content>I can explain why a cell needs a membrane.</content></field>
<field><field_id>s3</field_id><content>Jamie: extended time</content></field>`,
    SECTIONS,
    LESSON.sequence,
  )
  assert.deepEqual(
    laidOut.map((s) => [s.id, s.text]),
    [
      ['s1', 'I can explain why a cell needs a membrane.'],
      ['s2', 'Launch: the leaking bag (10 min)\nTeacher: Hold up the bag.\nStudents: Predict.'],
      ['s3', ''],
      ['s4', 'Why does a cell need a membrane?'],
    ],
  )
  assert.equal(laidOut[0].title, 'Learning Target')
  assert.ok(isUsableLayout(laidOut))
  assert.ok(!isUsableLayout(parseLayout('nothing useful', SECTIONS.filter((s) => s.kind !== 'opening'), [])))
})

test('steps are copied verbatim and held to teaching order, whatever placement comes back', () => {
  const sections: TemplateSection[] = [
    { id: 's1', title: 'Do Now', kind: 'opening', prompt: null },
    { id: 's2', title: 'I Do', kind: 'instruction', prompt: null },
    { id: 's3', title: 'We Do', kind: 'guided_practice', prompt: null },
    { id: 's4', title: 'You Do', kind: 'independent_practice', prompt: null },
  ]
  const steps = ['Launch', 'Inquiry', 'Naming the pattern', 'Second example', 'Practice'].map((title) => ({
    minutes: 5,
    title,
    teacher: null,
    students: null,
  }))
  // Step 3 is placed BEFORE step 2's section, and step 5 is not placed at all.
  const laidOut = parseLayout(
    `<place><step_number>1</step_number><field_id>s1</field_id></place>
<place><step_number>2</step_number><field_id>s3</field_id></place>
<place><step_number>3</step_number><field_id>s2</field_id></place>
<place><step_number>4</step_number><field_id>s4</field_id></place>`,
    sections,
    steps,
  )
  assert.deepEqual(
    laidOut.map((s) => s.text.split('\n\n').map((t) => t.replace(/ \(5 min\)$/, '')).filter(Boolean)),
    [['Launch'], [], ['Inquiry', 'Naming the pattern'], ['Second example', 'Practice']],
  )
})

test('the source key changes with the lesson and with the template, and only then', () => {
  const template = { id: 't1', updatedAt: new Date('2026-10-22T12:00:00Z'), sections: SECTIONS }
  const key = layoutSourceKey(LESSON, template)
  assert.equal(layoutSourceKey({ ...LESSON }, { ...template, updatedAt: '2026-10-22T12:00:00.000Z' }), key)
  assert.notEqual(layoutSourceKey({ ...LESSON, objective: 'Something else' }, template), key)
  assert.notEqual(layoutSourceKey(LESSON, { ...template, updatedAt: new Date('2026-10-23T12:00:00Z') }), key)
  assert.notEqual(layoutSourceKey(LESSON, { ...template, id: 't2' }), key)
})
