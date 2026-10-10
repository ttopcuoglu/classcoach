import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BETTER_TOOL_INSTRUCTION, prefillTarget, readBetterTool, type MeetingDetails, type MessageDetails, type PlanningDetails } from './betterTool.ts'

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
  assert.equal(offer?.key, 'planning_coach')
  assert.deepEqual(prefillTarget(details), { label: 'Build this lesson', path: '/lesson-planning' })
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
  const planning = details as PlanningDetails | null
  assert.equal(planning?.topic, 'mitosis')
  assert.equal(planning?.durationMinutes, undefined)
  assert.equal(planning?.kind, undefined)
})

test('a tool with no prefill of its own still offers its plain button', () => {
  const { offer, details } = readBetterTool('x\n<better_tool>lesson_debrief</better_tool>')
  assert.equal(offer?.key, 'lesson_debrief')
  assert.equal(prefillTarget(details), null)
})

test('the details block never reaches the teacher, even cut off mid-write', () => {
  const { text } = readBetterTool('Here you go.\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: pho')
  assert.equal(text, 'Here you go.')
})

// The message prefill. Its one required field is the situation; everything
// else is an enum the form owns, so a value Claude improvises is dropped
// rather than shown to a teacher as a selected option.

test('a message block fills the form and picks the writing tool', () => {
  const { offer, details } = readBetterTool(
    `Ugh, that's a stressful one.
<better_tool>communication_coach</better_tool>
<tool_details>
situation: a parent says their son is being singled out after a seat change
action: respond
recipient: parent_caregiver
purpose: behavior_concern
tone: warm
format: email
</tool_details>`,
  )
  assert.deepEqual(prefillTarget(details), { label: 'Write this message', path: '/communications?tool=write' })
  assert.deepEqual(details as MessageDetails, {
    mode: 'message',
    situation: 'a parent says their son is being singled out after a seat change',
    startingAction: 'respond',
    recipient: 'parent_caregiver',
    purpose: 'behavior_concern',
    tone: 'warm',
    format: 'email',
  })
})

test('an option Claude improvised is dropped, and the situation survives', () => {
  const { details } = readBetterTool(
    'x\n<better_tool>communication_coach</better_tool>\n<tool_details>\nsituation: missing homework again\naction: sideways\nrecipient: the mom\ntone: stern\n</tool_details>',
  )
  const message = details as MessageDetails | null
  assert.equal(message?.situation, 'missing homework again')
  // Not a known action, so the safe one: writing fresh rather than
  // answering a message nobody sent.
  assert.equal(message?.startingAction, 'new')
  assert.equal(message?.recipient, undefined)
  assert.equal(message?.tone, undefined)
})

test('when the tag and the details disagree, the details win', () => {
  // The button has to match the form the teacher is about to be shown, and
  // the details are what fills that form.
  const { offer, details } = readBetterTool('x\n<better_tool>communication_coach</better_tool>\n<tool_details>\ntopic: photosynthesis\n</tool_details>')
  assert.equal(offer?.key, 'planning_coach')
  assert.equal((details as PlanningDetails | null)?.topic, 'photosynthesis')
})

test('a details block that lost its tag still offers the right tool', () => {
  // Seen from the real model: the words and the two blocks are written
  // separately, and the tag line can go missing. That used to strip down
  // to a blank message with no button at all.
  const { offer, details } = readBetterTool('Got it.\n<tool_details>\nmode: message\nsituation: missing homework\n</tool_details>')
  assert.equal(offer?.key, 'communication_coach')
  assert.equal((details as MessageDetails | null)?.situation, 'missing homework')
})

test('a block with neither a topic nor a situation offers nothing', () => {
  const { offer, details } = readBetterTool('Got it.\n<tool_details>\ntone: warm\n</tool_details>')
  assert.equal(offer, null)
  assert.equal(details, null)
})

test('a meeting block goes to Prepare, not to Write', () => {
  const { details } = readBetterTool(
    `Dreading that makes sense.
<better_tool>communication_coach</better_tool>
<tool_details>
mode: meeting
situation: an IEP meeting with a parent who thinks we aren't doing enough
meeting_type: iep_504
setting: formal_meeting
outcome: her leaving believing we have a plan
worry: that it turns into a list of complaints
</tool_details>`,
  )
  assert.deepEqual(prefillTarget(details), { label: 'Get ready for this', path: '/communications?tool=prepare' })
  assert.deepEqual(details as MeetingDetails, {
    mode: 'meeting',
    situation: "an IEP meeting with a parent who thinks we aren't doing enough",
    recipient: undefined,
    meetingType: 'iep_504',
    meetingFormat: 'formal_meeting',
    desiredOutcome: 'her leaving believing we have a plan',
    concerns: 'that it turns into a list of complaints',
  })
})

test('a mode nobody recognises writes a message rather than booking a meeting', () => {
  // The safe default: the writing tool drafts something the teacher reads
  // before it goes anywhere.
  const { details } = readBetterTool(
    'x\n<better_tool>communication_coach</better_tool>\n<tool_details>\nmode: telepathy\nsituation: the thing\n</tool_details>',
  )
  assert.equal((details as MessageDetails | null)?.mode, 'message')
})
