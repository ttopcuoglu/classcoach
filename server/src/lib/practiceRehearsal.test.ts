import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPracticeRehearsalBlock } from './practiceRehearsal.ts'

type Attempt = Parameters<typeof buildPracticeRehearsalBlock>[0]

function attempt(overrides: { responseText?: string; source?: string; feedback?: string | null } = {}): Attempt {
  return {
    responseText: overrides.responseText ?? '',
    feedback: overrides.feedback === undefined ? 'Name the pattern privately.' : overrides.feedback,
    modelResponse: '"Hold it — I will come to you second."',
    scenario: { text: 'A student calls out every answer before anyone else can think.', source: overrides.source ?? 'teacher' },
  } as unknown as Attempt
}

test('carries the situation, the coaching and the words on every turn', () => {
  const block = buildPracticeRehearsalBlock(attempt(), false)
  assert.match(block, /real situation the teacher is facing/)
  assert.match(block, /calls out every answer/)
  assert.match(block, /Name the pattern privately/)
  assert.match(block, /I will come to you second/)
  assert.doesNotMatch(block, /first thing you say/)
})

test('a blank response reads as asking to be walked through, not as an empty quote', () => {
  const block = buildPracticeRehearsalBlock(attempt(), false)
  assert.match(block, /did not know what to say yet/)
  assert.doesNotMatch(block, /handle it like this: ""/)
})

test('a written response is quoted back', () => {
  const block = buildPracticeRehearsalBlock(attempt({ responseText: 'I would talk to him after class.' }), false)
  assert.match(block, /handle it like this: "I would talk to him after class\."/)
})

test('only the opening turn is told to open about the situation', () => {
  assert.match(buildPracticeRehearsalBlock(attempt(), true), /first thing you say/)
})

test('a generated scenario is not called real', () => {
  const block = buildPracticeRehearsalBlock(attempt({ source: 'generated' }), false)
  assert.match(block, /practice scenario/)
  assert.doesNotMatch(block, /real situation/)
})

test('a very long situation is clipped', () => {
  const long = attempt()
  ;(long.scenario as { text: string }).text = 'x'.repeat(5000)
  assert.ok(buildPracticeRehearsalBlock(long, false).length < 3500)
})
