import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strongChecks } from './questionMix.ts'

const check = (timestampSec: number, text: string, who?: string) => ({
  timestampSec, text, whatItChecked: '', ...(who ? { loop: { who, acted: null } } : {}),
})

test('strong checks leave out "does everyone understand?" and non-checks', () => {
  const got = strongChecks({
    questionLog: [],
    teachingMoves: null,
    cfuLog: [
      check(10, 'Show me on your fingers how many parts.', 'everyone'),
      check(40, 'Does everyone understand?', 'asked_if_understood'),
      check(70, 'Okay?', 'not_a_check'),
      check(90, 'Maria, what is the whole here?', 'few'),
    ],
  } as never)
  assert.deepEqual(got.map((c) => c.timestampSec), [10, 90])
})

test('a lesson read before the checks read keeps every stored check', () => {
  const got = strongChecks({ questionLog: [], teachingMoves: null, cfuLog: [check(5, 'Thumbs up if you agree.'), check(9, 'Tell your partner.')] } as never)
  assert.equal(got.length, 2)
})

test('a counted question tagged as a check joins, unless already stored', () => {
  const got = strongChecks({
    questionLog: [{ timestampSec: 100, text: 'What is five broken into two parts?' }, { timestampSec: 200, text: 'Why do we split it?' }],
    teachingMoves: { questionKinds: [{ timestampSec: 100, kind: 'recall', check: true }, { timestampSec: 200, kind: 'explain', check: false }] },
    cfuLog: [],
  } as never)
  assert.deepEqual(got.map((c) => c.timestampSec), [100])
})
