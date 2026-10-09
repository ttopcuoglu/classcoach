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
