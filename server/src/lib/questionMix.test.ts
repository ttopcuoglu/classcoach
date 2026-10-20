import assert from 'node:assert/strict'
import { test } from 'node:test'
import { questionMixOf, staffQuestionMix } from './questionMix.ts'

test('a finer kind within four seconds wins; otherwise the old split decides', () => {
  const log = [
    { timestampSec: 10, type: 'recall' },
    { timestampSec: 30, type: 'recall' },
    { timestampSec: 60, type: 'higher_order' },
    { timestampSec: 90, type: 'higher_order' },
  ]
  const moves = {
    questionKinds: [
      { timestampSec: 12, kind: 'justify', quote: 'x' },
      { timestampSec: 35, kind: 'explain', quote: 'x' },
      { timestampSec: 88, kind: 'recall', quote: 'x' },
    ],
  }
  // 10 → justify (2s away), 30 → no match (5s away) so recall, 60 → no match so
  // explain, 90 → recall (2s away) even though the old split said higher-order.
  assert.deepEqual(questionMixOf(log, moves), { recall: 2, explain: 1, reasoning: 1 })
})

test('lessons with no teaching-moves read, or no questions, are handled', () => {
  assert.deepEqual(questionMixOf([{ timestampSec: 1, type: 'higher_order' }], null), { recall: 0, explain: 1, reasoning: 0 })
  assert.deepEqual(questionMixOf(null, null), { recall: 0, explain: 0, reasoning: 0 })
})

test('staff totals add questions and count only lessons that had any', () => {
  const mix = staffQuestionMix([
    { questionLog: [{ timestampSec: 1, type: 'recall' }, { timestampSec: 9, type: 'higher_order' }], teachingMoves: null },
    { questionLog: [], teachingMoves: null },
    { questionLog: [{ timestampSec: 1, type: 'recall' }], teachingMoves: { questionKinds: [{ timestampSec: 1, kind: 'compare' }] } },
  ])
  assert.deepEqual(mix, { counts: { recall: 1, explain: 1, reasoning: 1 }, questions: 3, lessons: 2, beyondRecallPct: 67 })
})
