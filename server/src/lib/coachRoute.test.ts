import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOME_ROUTER_PROMPT, readHomeRoute, homeToolLabel } from './coachRoute.ts'
import type { PlanningDetails } from './betterTool.ts'

// Home's risk is different from the chat's. There, a missed tag costs
// nothing because the reply was the answer. Here the whole point is the
// door, so the failure to pin down is a reply that arrives with NO door —
// a teacher who typed a sentence into a box and got a sentence back, with
// nothing to tap. Every path below therefore ends somewhere.

test('a tagged reply gives the door and hides the tag', () => {
  const { text, offer } = readHomeRoute(
    'That is worth seeing in the numbers rather than from memory.\n<better_tool>lesson_debrief</better_tool>',
  )
  assert.equal(offer?.key, 'lesson_debrief')
  assert.equal(offer?.path, '/audio-coaching')
  assert.equal(text, 'That is worth seeing in the numbers rather than from memory.')
  assert.ok(!text.includes('better_tool'))
})

test('talk_it_through is a real door here, not a missing tag', () => {
  const { text, offer } = readHomeRoute('Five minutes talking it through usually finds the one next thing.\n<better_tool>talk_it_through</better_tool>')
  assert.equal(offer?.key, 'talk_it_through')
  assert.equal(offer?.path, '/talk-to-me')
  assert.ok(!text.includes('talk_it_through'))
})

test('a reply with no tag at all still ends somewhere', () => {
  const { text, offer } = readHomeRoute('That sounds like a hard week.')
  assert.equal(offer?.key, 'talk_it_through')
  assert.equal(text, 'That sounds like a hard week.')
})

test('a tool name Claude invented falls back to the conversation, not to nothing', () => {
  const { offer, text } = readHomeRoute('Here you go.\n<better_tool>lesson_wizard</better_tool>')
  assert.equal(offer?.key, 'talk_it_through')
  assert.ok(!text.includes('lesson_wizard'))
})

test('a details block prefills the form and picks the tool', () => {
  const { offer, details } = readHomeRoute(
    'Tell me how long the period is and I will build it.\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: photosynthesis\ngrade: 7th\n</tool_details>',
  )
  assert.equal(offer?.key, 'planning_coach')
  assert.equal((details as PlanningDetails).topic, 'photosynthesis')
  assert.equal((details as PlanningDetails).durationMinutes, undefined)
})

test('a length the teacher gave survives, so the door can build', () => {
  const { details } = readHomeRoute(
    'On it.\n<better_tool>planning_coach</better_tool>\n<tool_details>\ntopic: fractions\nminutes: 50\n</tool_details>',
  )
  assert.equal((details as PlanningDetails).durationMinutes, 50)
})

// talk_it_through means "no tool fits". A details block beside it is the
// model contradicting itself, and the safe reading of a contradiction is
// the door that cannot prefill anything wrong.
test('details written beside talk_it_through are dropped, not acted on', () => {
  const { offer, details } = readHomeRoute(
    'Let us talk about it.\n<better_tool>talk_it_through</better_tool>\n<tool_details>\nsituation: a parent is angry\n</tool_details>',
  )
  assert.equal(offer?.key, 'talk_it_through')
  assert.equal(details, null)
})

test('a reply cut off mid-tag shows the words and no markup', () => {
  const { text, offer } = readHomeRoute('That one is worth recording.\n<better_tool>lesson_deb')
  assert.equal(offer?.key, 'talk_it_through')
  assert.ok(!text.includes('<better_tool'))
})

test('the prompt names every key the parser accepts', () => {
  for (const key of ['lesson_debrief', 'practice', 'planning_coach', 'assignment_coach', 'communication_coach', 'talk_it_through']) {
    assert.ok(HOME_ROUTER_PROMPT.includes(`- ${key}:`), `${key} is missing from the prompt`)
    assert.ok(homeToolLabel(key as Parameters<typeof homeToolLabel>[0]).length > 0)
  }
})

// The duration guard is the one rule here with a teacher-visible cost when
// it slips: a lesson silently built to a period length nobody gave.
test('the prompt forbids guessing a lesson length', () => {
  assert.ok(HOME_ROUTER_PROMPT.includes('Never guess a length'))
})

// Below 1024 tokens Sonnet 5 silently stops caching the prefix — see
// promptCache.ts. This is a crude proxy for that line, so a future edit
// that halves the prompt trips a test rather than quietly tripling the
// per-question cost.
test('the prompt is long enough to stay cacheable', () => {
  assert.ok(HOME_ROUTER_PROMPT.length > 4500, `prompt is ${HOME_ROUTER_PROMPT.length} chars — check it still caches`)
})

// Both of these are real misroutes from the first eval run against the
// live model, pinned so a prompt edit cannot quietly bring them back.

test('a tag for a tool with no form beats a details block it should not have written', () => {
  const { offer, details } = readHomeRoute(
    'Worth a look at the task itself.\n<better_tool>assignment_coach</better_tool>\n<tool_details>\ntopic: lab write-up on diffusion\n</tool_details>',
  )
  assert.equal(offer?.key, 'assignment_coach')
  assert.equal(offer?.path, '/lesson-planning?tab=assignment')
  assert.equal(details, null)
})

test('the prompt keeps what already happened out of Practice', () => {
  assert.ok(HOME_ROUTER_PROMPT.includes('has NOT happened yet'))
  assert.ok(HOME_ROUTER_PROMPT.includes('talk_it_through, even when they wish they had said something different'))
})
