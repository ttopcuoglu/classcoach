import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countedQuestions, isClosedQuestion, questionMixOf, staffQuestionMix } from './questionMix.ts'

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

test("Bloom's kinds, stored since Oct 26, sort the way the lesson page sorts them", () => {
  const log = [10, 30, 50, 70, 90, 110].map((timestampSec) => ({ timestampSec, type: 'recall' }))
  const moves = {
    questionKinds: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'].map((kind, i) => ({ timestampSec: 10 + i * 20, kind, quote: 'x' })),
  }
  assert.deepEqual(questionMixOf(log, moves), { recall: 1, explain: 2, reasoning: 3 })
})

test('a question the teacher answered themself is left out, as the lesson page leaves it out', () => {
  const log = [
    { timestampSec: 10, type: 'recall', text: 'What year was it? It was 1820.' },
    { timestampSec: 40, type: 'recall', text: 'Why did the canal matter?' },
  ]
  const moves = { questionKinds: [{ timestampSec: 40, kind: 'understand', quote: 'x' }], selfAnswered: [{ timestampSec: 11, quote: 'What year was it?' }] }
  assert.deepEqual(questionMixOf(log, moves), { recall: 0, explain: 1, reasoning: 0 })
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

test('one-word questions are not counted; entries with no text still are', () => {
  const log = [
    { timestampSec: 10, type: 'recall', text: 'Right?' },
    { timestampSec: 20, type: 'recall', text: '2?' },
    { timestampSec: 30, type: 'recall', text: 'Twenty twenty what?' },
    { timestampSec: 40, type: 'higher_order' },
  ]
  assert.deepEqual(countedQuestions(log, null).questions.map((q) => q.timestampSec), [30, 40])
})

test('a yes/no question is recall, whatever the read called it', () => {
  for (const t of [
    'Is there a dot on here that says 11 avocados?',
    'Would your statement work for the others too?',
    'So, does it go up?',
    'Sarah, is that positive or negative?',
    'Can’t we just add them?',
  ])
    assert.equal(isClosedQuestion(t), true, t)
  for (const t of [
    'What direction does it have?',
    'Why does it go up?',
    'Can you tell me what a residual is?',
    'Does anyone know how we made the residual plot?',
    'Could you explain your answer?',
    'Which one did you pick?',
  ])
    assert.equal(isClosedQuestion(t), false, t)
  const log = [
    { timestampSec: 10, type: 'higher_order', text: 'Would your statement work for the others too?' },
    { timestampSec: 30, type: 'higher_order', text: 'Why would it work for the others?' },
  ]
  const moves = { questionKinds: [{ timestampSec: 10, kind: 'evaluate', quote: 'x' }, { timestampSec: 30, kind: 'evaluate', quote: 'x' }] }
  assert.deepEqual(countedQuestions(log, moves).questions.map((q) => q.mix), ['recall', 'reasoning'])
})
