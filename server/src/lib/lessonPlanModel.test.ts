import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isUsableLesson,
  lessonAsText,
  lessonMinutes,
  parseFullLesson,
  parseInferredContext,
  parseQuickIdeas,
} from './lessonPlanModel.ts'

// A tag renamed in the prompt and not in the parser is a section that silently
// comes back empty — the teacher sees a lesson with no exit ticket and nothing
// anywhere says why. These tests are the pairing.

const FULL = `<approach>Inquiry, then guided practice</approach>
<objective>Students will be able to explain why a cell needs a membrane.</objective>
<success_criteria>
- I can name two things a membrane does
- I can explain what happens without one
</success_criteria>
<materials>
- Dialysis tubing
- Iodine
</materials>
<step>
<step_minutes>10</step_minutes>
<step_title>Launch: the leaking bag</step_title>
<teacher_prompt>Hold up the bag. Ask what they expect to happen and why.</teacher_prompt>
<student_task>Write a prediction and one reason in their notebooks.</student_task>
</step>
<step>
<step_minutes>20</step_minutes>
<step_title>Investigation</step_title>
<teacher_prompt>Circulate and ask groups what their evidence rules out.</teacher_prompt>
<student_task>Run the test in pairs and record what changes.</student_task>
</step>
<cfu>
<check_moment>After the prediction</check_moment>
<the_check>Students write their prediction and reason on a whiteboard.</the_check>
<look_for>A reason that mentions what crosses the barrier, not just "it leaks".</look_for>
</cfu>
<misconception>
<likely_belief>Students often think the membrane is a solid wall that blocks everything.</likely_belief>
<how_to_surface>Ask whether water gets in, and how they know.</how_to_surface>
<how_to_address>Compare it to a screen door rather than a brick wall.</how_to_address>
</misconception>
<exit_ticket>
<task_for_students>Explain in two sentences why a cell without a membrane cannot survive.</task_for_students>
<expected_answer>Names control of what enters and leaves.</expected_answer>
<what_responses_show>A strong answer names selectivity; a partial one says "it holds things in".</what_responses_show>
<next_step>If most answers stop at "it holds things in", open tomorrow with the screen-door comparison.</next_step>
</exit_ticket>`

test('a full lesson parses every section the prompt asks for', () => {
  const lesson = parseFullLesson(FULL)
  assert.equal(lesson.approach, 'Inquiry, then guided practice')
  assert.match(lesson.objective ?? '', /membrane/)
  assert.match(lesson.successCriteria ?? '', /two things a membrane does/)
  assert.match(lesson.materials ?? '', /Dialysis tubing/)

  assert.equal(lesson.sequence.length, 2)
  assert.deepEqual(
    lesson.sequence.map((s) => s.minutes),
    [10, 20],
  )
  assert.equal(lesson.sequence[0].title, 'Launch: the leaking bag')
  assert.match(lesson.sequence[1].teacher ?? '', /Circulate/)
  assert.match(lesson.sequence[1].students ?? '', /in pairs/)

  assert.equal(lesson.checks.length, 1)
  assert.equal(lesson.checks[0].when, 'After the prediction')
  assert.match(lesson.checks[0].lookFor ?? '', /crosses the barrier/)

  assert.equal(lesson.misconceptions.length, 1)
  assert.match(lesson.misconceptions[0].belief, /solid wall/)
  assert.match(lesson.misconceptions[0].surface ?? '', /water gets in/)

  assert.match(lesson.exitTicket?.task ?? '', /two sentences/)
  assert.match(lesson.exitTicket?.expected ?? '', /enters and leaves/)
  assert.match(lesson.exitTicket?.signals ?? '', /partial/)
  assert.match(lesson.exitTicket?.nextStep ?? '', /tomorrow/)
  assert.ok(isUsableLesson(lesson))
})

test('a response cut off before the sequence is not shown as a lesson', () => {
  const lesson = parseFullLesson('<approach>Discussion</approach>\n<objective>Something</objective>')
  assert.equal(lesson.sequence.length, 0)
  assert.equal(isUsableLesson(lesson), false)
})

test('a step with no title is dropped rather than rendered blank', () => {
  const lesson = parseFullLesson(`${FULL}\n<step>\n<step_minutes>5</step_minutes>\n</step>`)
  assert.equal(lesson.sequence.length, 2)
})

test('quick ideas parse, and cap at five', () => {
  const block = (n: number) => `<idea><idea_title>Idea ${n}</idea_title><how_it_works>How ${n}.</how_it_works></idea>`
  const ideas = parseQuickIdeas(Array.from({ length: 7 }, (_, i) => block(i + 1)).join('\n'))
  assert.equal(ideas.length, 5)
  assert.equal(ideas[0].title, 'Idea 1')
  assert.equal(ideas[4].how, 'How 5.')
})

test('an idea missing its explanation is dropped', () => {
  assert.deepEqual(parseQuickIdeas('<idea><idea_title>Just a title</idea_title></idea>'), [])
})

test('a lesson reads back as prose for delivery coaching and the deck', () => {
  const lesson = parseFullLesson(FULL)
  const text = lessonAsText({ ...lesson, durationMinutes: 45 })
  assert.match(text, /Approach: Inquiry/)
  assert.match(text, /Length: 45 minutes/)
  assert.match(text, /1\. Launch: the leaking bag \(10 min\)/)
  assert.match(text, /Teacher: Hold up the bag/)
  assert.match(text, /Students: Write a prediction/)
  assert.match(text, /Likely misconceptions:/)
  assert.match(text, /Exit ticket:/)
  // No structural markup reaches anything downstream.
  assert.ok(!text.includes('<'))
})

test('the old five-slot sample plans still read back', () => {
  const text = lessonAsText({
    doNow: 'Warm-up question.',
    agenda: 'I Do / We Do / You Do.',
    closure: 'Ticket out the door.',
    hots: 'Why does it matter?',
    homework: 'None',
  })
  assert.equal(text, 'Warm-up question.\n\nI Do / We Do / You Do.\n\nTicket out the door.\n\nWhy does it matter?\n\nNone')
})

test("a plan the teacher wrote themselves reads back as what they wrote", () => {
  assert.equal(lessonAsText({ planText: '  My own plan.  ' }), 'My own plan.')
})

test('a lesson without a stored duration falls back to what its steps add up to', () => {
  const lesson = parseFullLesson(FULL)
  assert.equal(lessonMinutes({ sequence: lesson.sequence }), 30)
  assert.equal(lessonMinutes({ durationMinutes: 45, sequence: lesson.sequence }), 45)
  assert.equal(lessonMinutes({}), null)
})

test('inferred context treats a refusal to guess as nothing found', () => {
  const parsed = parseInferredContext(`<inferred_topic>Photosynthesis</inferred_topic>
<inferred_subject>Biology</inferred_subject>
<inferred_grade></inferred_grade>
<follow_up>none</follow_up>`)
  assert.deepEqual(parsed, { topic: 'Photosynthesis', subject: 'Biology', gradeLevel: null, followUp: null })
})

test('a real follow-up question survives', () => {
  const parsed = parseInferredContext(
    '<inferred_topic>A reading on the Dust Bowl</inferred_topic><follow_up>What do you want students to be able to do with this reading?</follow_up>',
  )
  assert.match(parsed.followUp ?? '', /able to do/)
  assert.equal(parsed.subject, null)
})
