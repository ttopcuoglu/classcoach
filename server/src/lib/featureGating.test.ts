import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMMUNICATIONS_ACTIONS, LESSON_PLANNING_ACTIONS } from './billing.ts'
import { CONVERSATIONAL_ACTIONS, type UsageAction } from './usageLimit.ts'

// Which actions sit inside a paywall is not a detail you can see by reading a
// route: it is decided by membership of a list in another file. That is how
// Practice's conversation rehearsal came to answer a free teacher with
// "Messages is part of Wivoza Plus" after it moved out of Communication Coach —
// the surface moved, the list entry did not. These assert the split that fixed
// it, so the next action added to conversationPrep.ts has to choose a side on
// purpose rather than inherit one.

const FREE_FOREVER: UsageAction[] = [
  // Talk It Through.
  'talk_to_me',
  'talk_to_me_chat',
  'talk_to_me_takeaway',
  // Practice, scenario half.
  'scenario_generate',
  'attempt_feedback',
  'attempt_chat',
  // Practice, conversation half — same surface, same promise.
  'conversation_practice_generate',
  'conversation_practice_feedback',
  'conversation_practice_chat',
]

test('nothing on a free-forever surface sits behind a Plus gate', () => {
  for (const action of FREE_FOREVER) {
    assert.ok(
      !COMMUNICATIONS_ACTIONS.includes(action),
      `${action} is on a free surface but counts against the Communications paywall`,
    )
    assert.ok(
      !LESSON_PLANNING_ACTIONS.includes(action),
      `${action} is on a free surface but counts against the Lesson Planning paywall`,
    )
  }
})

test('both halves of Practice share one ceiling', () => {
  // Not cosmetic: the two buckets have different daily limits and only the
  // conversational one has a monthly cap, so a half of Practice outside this
  // list would be capped on a different schedule from the half beside it.
  for (const action of FREE_FOREVER) {
    assert.ok(
      CONVERSATIONAL_ACTIONS.includes(action),
      `${action} is part of Practice or Talk It Through but is capped as a non-conversational action`,
    )
  }
})

test('Communication Coach keeps its own three tools behind the gate', () => {
  // conversationPrep.ts serves both products; only the review half is Plus.
  for (const action of [
    'parent_message',
    'parent_message_chat',
    'conversation_prep_feedback',
    'conversation_prep_generate',
    'conversation_prep_chat',
    'conversation_plan_feedback',
    'conversation_plan_chat',
  ] satisfies UsageAction[]) {
    assert.ok(COMMUNICATIONS_ACTIONS.includes(action), `${action} is a Plus feature but falls outside the gate`)
  }
})

test('the two paywalls do not both claim the same action', () => {
  const overlap = COMMUNICATIONS_ACTIONS.filter((a) => LESSON_PLANNING_ACTIONS.includes(a))
  assert.deepEqual(overlap, [], 'an action counted against two monthly allowances is charged twice')
})
