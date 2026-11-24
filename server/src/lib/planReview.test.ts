import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPlanReviewPrompt, parsePlanReview } from './planReview.ts'

const FORMAT = { name: 'Maple Ridge Daily Plan', sections: [{ title: 'Objective', prompt: 'What students will be able to do' }, { title: 'Do Now', prompt: null }, { title: 'Exit Ticket', prompt: null }] }

test('the prompt carries the plan, the lesson and the school format', () => {
  const prompt = buildPlanReviewPrompt({
    sections: [{ ref: 'Objective', text: 'Students will explain why salt water conducts.' }],
    context: { lessonTitle: 'Conductivity', grade: '8' },
    format: FORMAT,
    sharedRules: '',
  })
  assert.match(prompt, /grade 8 "Conductivity"/)
  assert.match(prompt, /"Maple Ridge Daily Plan"/)
  assert.match(prompt, /1\. Objective \(asks for: What students will be able to do\)/)
  assert.match(prompt, /\(1\) Objective: Students will explain/)
})

test('a review reads about, strengths, next steps and every format section', () => {
  const reply = `<about>An 8th grade lab on conductivity.</about>
<format_section><title>Objective</title><status>present</status><note>Clear and measurable.</note></format_section>
<format_section><title>exit ticket</title><status>thin</status><note>none</note></format_section>
<strength>The objective names what students will explain.</strength>
<strength>The lab builds from prediction to evidence.</strength>
<next_step>Add a success criterion to the exit ticket.</next_step>`
  const planning = [{ code: '1c', name: 'Outcomes', domain: 'Domain 1', level: 3 as const, explanation: 'e', excerpts: [] }]
  const r = parsePlanReview(reply, { planning, format: FORMAT })
  assert.ok(r)
  assert.equal(r!.about, 'An 8th grade lab on conductivity.')
  assert.equal(r!.strengths.length, 2)
  assert.deepEqual(r!.nextSteps, ['Add a success criterion to the exit ticket.'])
  assert.deepEqual(
    r!.format!.sections.map((s) => [s.title, s.status, s.note]),
    [
      ['Objective', 'present', 'Clear and measurable.'],
      ['Do Now', 'missing', null],
      ['Exit Ticket', 'thin', null],
    ],
    'every section of the school format, in order; one not read is missing',
  )
  assert.equal(r!.planning, planning)
})

test('no format means no format check, and an empty reply is refused', () => {
  const r = parsePlanReview('<about>A lesson.</about><strength>Clear goal.</strength>', { planning: null, format: null })
  assert.equal(r!.format, null)
  assert.equal(parsePlanReview('nothing useful', { planning: null, format: null }), null)
})
