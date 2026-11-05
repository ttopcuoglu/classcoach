import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leaderHintPrompt } from './leaderCoaching.ts'
import { leaderProfile } from './leaderLevels.ts'
import { LEADER_ACTIONS } from './usageLimit.ts'

const assistant = leaderProfile({ leaderLevel: 'assistant', leaderAreas: [], leaderEvaluates: false })!

test('the hint is coached at the leader’s own level', () => {
  assert.match(leaderHintPrompt(assistant, []), new RegExp(assistant.level.label.toLowerCase()))
})

test('"Another hint" is told what the leader already has', () => {
  const prompt = leaderHintPrompt(assistant, ['Notice who is in the room.'])
  assert.match(prompt, /already have these hints/)
  assert.match(prompt, /Notice who is in the room\./)
  assert.doesNotMatch(leaderHintPrompt(assistant, []), /already have these hints/)
})

test('asking for a hint stays off every admin count', () => {
  assert.ok(LEADER_ACTIONS.includes('leader_hint'))
})
