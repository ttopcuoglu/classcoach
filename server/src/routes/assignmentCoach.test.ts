import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reviewDocBlocks } from './assignmentCoach.ts'

// A printed review said "Learning value — some_repetition". The model
// answers these with machine values and the web maps them on screen, so
// the PDF — built where there is no browser — has to map them too.

const SNAPSHOT = {
  purpose: 'Recall and label the stages of the water cycle.',
  gradeFit: { rating: 'appropriate', explanation: 'Vocabulary fits early elementary.' },
  rigor: { label: 'Mostly recall', explanation: 'Matching terms to definitions.' },
  meaningfulWork: { rating: 'some_repetition', explanation: 'Both parts check the same thing.', suggestion: null },
  aiRisk: { rating: 'low', explanation: 'It is done on paper.', reasons: null },
  workloadSummary: null,
  mainOpportunity: { title: 'Ask them to explain one stage', description: 'Turns naming into reasoning.' },
}

function headings(blocks: ReturnType<typeof reviewDocBlocks>): string[] {
  return blocks.filter((b) => b.type === 'heading').map((b) => (b as { text: string }).text)
}

test('a machine rating is printed as words', () => {
  const blocks = reviewDocBlocks({ objective: null, estimatedTime: null, reviewSnapshot: SNAPSHOT })
  assert.deepEqual(headings(blocks), [
    'Grade fit — appears grade-level appropriate',
    'Thinking and rigour — Mostly recall',
    'Learning value — some low-value repetition',
    'How much a chatbot could do — low',
  ])
})

test('a rating nobody has a label for is still readable', () => {
  const blocks = reviewDocBlocks({
    objective: null,
    estimatedTime: null,
    reviewSnapshot: { ...SNAPSHOT, meaningfulWork: { ...SNAPSHOT.meaningfulWork, rating: 'brand_new_value' } },
  })
  assert.ok(headings(blocks).includes('Learning value — brand new value'))
})

test('no review, no blocks', () => {
  assert.deepEqual(reviewDocBlocks({ objective: null, estimatedTime: null, reviewSnapshot: null }), [])
})
