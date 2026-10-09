import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BETTER_TOOL_INSTRUCTION, readBetterTool } from './betterTool.ts'

// The risk here is not a missed suggestion — it is markup reaching a
// teacher's chat, or a button that goes nowhere because Claude invented a
// tool name. Both are pinned below, along with the truncated-reply case,
// which is the one that actually happens in production: the tag is the last
// thing written, so max_tokens lands in the middle of it.

test('a tagged reply gives the button and hides the tag', () => {
  const { offer, text } = readBetterTool(
    "That sounds like a rough one. Try naming the behaviour once, then moving on.\n<better_tool>planning_coach</better_tool>",
  )
  assert.equal(offer?.key, 'planning_coach')
  assert.equal(offer?.path, '/lesson-planning')
  assert.equal(text, 'That sounds like a rough one. Try naming the behaviour once, then moving on.')
})

test('an untagged reply is left exactly as it is', () => {
  const reply = "Oof, third period again. What did you try last time?"
  const { offer, text } = readBetterTool(reply)
  assert.equal(offer, null)
  assert.equal(text, reply)
})

test('a tool name Claude invented offers nothing and still leaves no markup', () => {
  const { offer, text } = readBetterTool('Here you go.\n<better_tool>iep_wizard</better_tool>')
  assert.equal(offer, null)
  assert.equal(text, 'Here you go.')
})

test('a reply cut off mid-tag shows the words and no markup', () => {
  const { offer, text } = readBetterTool('Here you go.\n<better_tool>assignm')
  assert.equal(offer, null)
  assert.equal(text, 'Here you go.')
})

test('a key with stray whitespace or capitals still resolves', () => {
  const { offer } = readBetterTool('Sure.\n<better_tool> Assignment_Coach </better_tool>')
  assert.equal(offer?.key, 'assignment_coach')
  assert.equal(offer?.path, '/lesson-planning?tab=assignment')
})

test('the instruction names every tool the parser accepts', () => {
  for (const key of ['lesson_debrief', 'practice', 'planning_coach', 'assignment_coach', 'communication_coach']) {
    assert.ok(BETTER_TOOL_INSTRUCTION.includes(`- ${key}:`), `${key} is missing from the prompt`)
    assert.ok(readBetterTool(`x\n<better_tool>${key}</better_tool>`).offer, `${key} is not parsed`)
  }
})

// The prefill block. A mangled line here should cost one field, never the
// whole handoff and never a wrong number in a teacher's form.

const TAGGED_PLAN = `Monday's workable — what have you got already?
<better_tool>planning_coach</better_tool>
<tool_details>
topic: photosynthesis
subject: Science
grade: 7th
minutes: 45
kind: full
</tool_details>`

test('a full details block fills every field and leaves no markup', () => {
  const { offer, details, text } = readBetterTool(TAGGED_PLAN)
  assert.equal(offer?.prefillLabel, 'Build this lesson')
  assert.deepEqual(details, {
    topic: 'photosynthesis',
    subject: 'Science',
    gradeLevel: '7th',
    durationMinutes: 45,
    kind: 'full',
  })
  assert.equal(text, "Monday's workable — what have you got already?")
})

test('details with only a topic are still worth having', () => {
  const { details } = readBetterTool('Sure.\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: long division\n</tool_details>')
  assert.deepEqual(details, { topic: 'long division', subject: undefined, gradeLevel: undefined, durationMinutes: undefined, kind: undefined })
})

test('a details block with no topic is dropped — an empty form is the same as none', () => {
  const { offer, details } = readBetterTool('Sure.\n<better_tool>planning_coach</better_tool>\n<tool_details>\nsubject: Science\n</tool_details>')
  assert.ok(offer)
  assert.equal(details, null)
})

test('a length no lesson has is dropped, and the rest survives', () => {
  const { details } = readBetterTool('x\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: mitosis\nminutes: 4\nkind: sideways\n</tool_details>')
  assert.equal(details?.topic, 'mitosis')
  assert.equal(details?.durationMinutes, undefined)
  assert.equal(details?.kind, undefined)
})

test('a tool with no prefill of its own still offers its plain button', () => {
  const { offer } = readBetterTool('x\n<better_tool>lesson_debrief</better_tool>')
  assert.equal(offer?.key, 'lesson_debrief')
  assert.equal(offer?.prefillLabel, undefined)
})

test('the details block never reaches the teacher, even cut off mid-write', () => {
  const { text } = readBetterTool('Here you go.\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: pho')
  assert.equal(text, 'Here you go.')
})
