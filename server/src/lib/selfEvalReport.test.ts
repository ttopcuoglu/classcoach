import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aboutHeading,
  buildSupervisorReport,
  notesByComponent,
  parseAbout,
  parsePlanning,
  planSections,
  readChoices,
  reportLevels,
  type SelfEvalLens,
} from './selfEvalReport.ts'

const PLAN = `Objective
Students will be able to explain why some solutions conduct electricity, using evidence from their own tests.

Materials: conductivity testers, salt, sugar, distilled water, data table handout.

Lesson sequence:
1. Do Now (5 min): predict which cups will light the bulb.
2. Lab (20 min): pairs test four solutions and record results.
3. Discussion (10 min): pairs compare results and explain the pattern.

Exit ticket:
Explain in two sentences why salt water conducts and sugar water does not.`

test('a plan splits into sections named by its own headings', () => {
  const sections = planSections(PLAN)
  assert.deepEqual(sections.map((s) => s.ref), ['Objective', 'Materials', 'Lesson sequence', 'Exit ticket'])
  assert.ok(sections[0].text.startsWith('Students will be able to explain'))
})

test('a plan with no headings still gets numbered parts', () => {
  const sections = planSections('We will read the poem together and talk about it.\n\n'.repeat(1) + 'x'.repeat(1000) + '\n\nThen students write a reply to the poet.')
  assert.ok(sections.length >= 2)
  assert.match(sections[0].ref, /^Part \d+$/)
})

test('Domain 1 keeps only word-for-word quotes, and no quote means no level', () => {
  const sections = planSections(PLAN)
  const reply = `
<component><code>1c</code><level>3</level><quote section="1">explain why some solutions conduct electricity</quote><explanation>The outcome names what students will be able to do.</explanation></component>
<component><code>1f</code><level>3</level><quote section="4">Students will write a lab report</quote><explanation>Invented quote.</explanation></component>
<component><code>1b</code><level>not_enough</level><explanation>The plan doesn't mention these students.</explanation></component>
<component><code>1a</code><level>4</level><quote section="2">conductivity testers, salt, sugar</quote><explanation>x</explanation></component>
<component><code>1d</code><level>2</level><quote section="2">data table handout</quote><explanation>x</explanation></component>
<component><code>1e</code><level>3</level><quote section="3">pairs test four solutions and record results</quote><explanation>x</explanation></component>`
  const out = parsePlanning(reply, sections)
  assert.equal(out.length, 6)
  const byCode = Object.fromEntries(out.map((c) => [c.code, c]))
  assert.equal(byCode['1c'].level, 3)
  assert.deepEqual(byCode['1c'].excerpts, [{ ref: 'Objective', text: 'explain why some solutions conduct electricity' }])
  assert.equal(byCode['1f'].level, null, 'a quote not in the plan is dropped, and the level with it')
  assert.equal(byCode['1f'].excerpts.length, 0)
  assert.equal(byCode['1b'].level, null)
  assert.ok(out.every((c) => c.domain === 'Domain 1: Planning and Preparation'))
})

test('the About heading reads like the class', () => {
  assert.equal(aboutHeading('8th', 'Science'), 'Grade 8 Science')
  assert.equal(aboutHeading(null, 'social_studies'), 'Social studies')
  assert.equal(aboutHeading(null, null), null)
})

test('an About reply too short to be a paragraph is refused', () => {
  assert.equal(parseAbout('<about>Short.</about>'), null)
  assert.match(parseAbout('<about>The lesson was about how dissolved substances change whether water conducts electricity.</about>') ?? '', /^The lesson/)
})

const LENS: SelfEvalLens = {
  framework: 'danielson_2022',
  frameworkName: 'Danielson',
  generatedAt: '2026-11-18T00:00:00.000Z',
  scored: true,
  notObservable: [],
  components: [
    { code: '3a', name: 'Purpose', domain: 'Domain 3', audibility: 'strong', level: 3, summary: 's', nextStep: null, evidence: [{ kind: 'k', timestampSec: 100, text: 'goal' }] },
    { code: '3b', name: 'Questions', domain: 'Domain 3', audibility: 'strong', level: null, summary: 's', nextStep: null, evidence: [{ kind: 'k', timestampSec: 300, text: 'q' }] },
  ],
  about: { heading: 'Grade 8 Science', text: 'About the lesson.', generatedAt: 'x', usedPlan: false },
  plan: { source: 'paste', label: 'Pasted plan', sections: [{ ref: 'Objective', text: 'o' }], attachedAt: 'x' },
  planning: { generatedAt: 'x', components: [{ code: '1c', name: 'Outcomes', domain: 'Domain 1', level: 3, explanation: 'e', excerpts: [{ ref: 'Objective', text: 'o' }] }] },
}

const NOTES = [
  { id: 'n1', label: 'What worked', text: 'Good model.', excerpt: 'e', timestampSec: 110 },
  { id: 'n2', label: 'Worth double-checking', text: 'Was that right?', excerpt: 'e', timestampSec: 100 },
  { id: 'n3', label: 'Where it could go further', text: 'Try a diagram.', excerpt: 'e', timestampSec: 900 },
  { id: 'n4', label: 'What worked', text: 'Near an unplaced level.', excerpt: 'e', timestampSec: 300 },
]

test('a note sits beside a level only when it is about one of its moments, and never a double-check', () => {
  const beside = notesByComponent(LENS.components, NOTES)
  assert.deepEqual(beside.get('3a')?.map((n) => n.id), ['n1'])
  assert.equal(beside.get('3b'), undefined, 'a component with no level gets no notes')
})

test('the report holds exactly the teacher’s choices', () => {
  const choices = readChoices({ previewed: true, removedNoteIds: ['n1'] })
  const report = buildSupervisorReport(LENS, { notes: NOTES }, ['A way in.'], choices)
  assert.equal(report.about?.text, 'About the lesson.')
  assert.equal(report.components[0].contentNotes.length, 0, 'a note the teacher removed is not sent')
  assert.equal(report.additionalContent, null, 'extra feedback is off by default')
  assert.equal(report.planning?.fullPlan, null, 'only the cited excerpts, unless the teacher adds the plan')
  assert.equal(report.components[0].level, 3)

  const withExtras = buildSupervisorReport(LENS, { notes: NOTES }, ['A way in.'], readChoices({ previewed: true, includeAdditionalContent: true, includeFullPlan: true }))
  assert.deepEqual(withExtras.components[0].contentNotes.map((n) => n.id), ['n1'])
  assert.deepEqual(withExtras.additionalContent?.notes.map((n) => n.id), ['n2', 'n3', 'n4'])
  assert.deepEqual(withExtras.additionalContent?.waysIn, ['A way in.'])
  assert.equal(withExtras.planning?.fullPlan?.length, 1)
  assert.deepEqual(
    withExtras.components.map((c) => [c.code, c.level, c.summary]),
    report.components.map((c) => [c.code, c.level, c.summary]),
    'what is included never changes a level or its explanation',
  )
})

test('a share made without the preview carries only levels and notes', () => {
  const report = buildSupervisorReport(LENS, { notes: NOTES }, ['A way in.'], readChoices({ share: true }))
  assert.equal(report.about, null)
  assert.equal(report.planning, null)
  assert.equal(report.additionalContent, null)
  assert.ok(report.components.every((c) => c.contentNotes.length === 0))
})

test('report counts include Domain 1 when a plan was sent', () => {
  const report = buildSupervisorReport(LENS, null, [], readChoices({ previewed: true }))
  assert.deepEqual(reportLevels(report).map((c) => c.code), ['1c', '3a', '3b'])
})
