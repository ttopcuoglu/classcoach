import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keepDoing } from './keepDoing.ts'

const base = { questionLog: [], teachingMoves: null, contentNotes: null } as never

test('a reasoning question is kept first, with names hidden', () => {
  const k = keepDoing({
    ...(base as object),
    questionLog: [
      { timestampSec: 10, type: 'recall', text: 'What year?', waitTimeSec: null, followUps: [] },
      { timestampSec: 60, type: 'higher_order', text: 'Maya, which is stronger, and why?', waitTimeSec: null, followUps: [] },
    ],
    teachingMoves: { questionKinds: [{ timestampSec: 60, kind: 'compare', quote: '' }] },
  } as never)!
  assert.match(k.text, /justify, compare or judge 1 time/)
  assert.equal(k.quote, '[name], which is stronger, and why?')
})

test('nothing to keep gives null', () => {
  assert.equal(keepDoing(base), null)
})
