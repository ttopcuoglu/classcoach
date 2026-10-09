import { strict as assert } from 'node:assert'
import test from 'node:test'
import { admitsSentence, countWords, sentencesWithinBudget, TALK_REPLY_WORD_BUDGET } from './replyBudget.ts'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.'

test('a reply that fits is left alone', () => {
  const reply = [words(20), words(20)]
  assert.deepEqual(sentencesWithinBudget(reply, 60), reply)
})

test('a sentence that would cross the budget is dropped whole', () => {
  const kept = sentencesWithinBudget([words(30), words(20), words(25)], 60)
  assert.equal(kept.length, 2, 'the third sentence crosses 60 and is not spoken')
  assert.equal(kept.reduce((n, s) => n + countWords(s), 0), 50)
})

test('the budget is never met by cutting a sentence in half', () => {
  for (const kept of [sentencesWithinBudget([words(40), words(40)], 60)]) {
    for (const sentence of kept) assert.ok(sentence.endsWith('.'), 'every spoken sentence is whole')
  }
})

test('the first sentence is spoken even when it alone blows the budget', () => {
  // The run-on case: nothing can rescue it, and silence is worse.
  const kept = sentencesWithinBudget([words(123), words(10)], 60)
  assert.equal(kept.length, 1)
  assert.equal(countWords(kept[0]), 123)
})

test('no budget means no limit', () => {
  const reply = [words(80), words(80)]
  assert.deepEqual(sentencesWithinBudget(reply, undefined), reply)
})

test('an empty reply stays empty', () => {
  assert.deepEqual(sentencesWithinBudget([], 60), [])
})

test('the measured failures would all have been caught', () => {
  // The three replies that actually came back over budget today.
  for (const [first, second] of [
    [words(39), words(84)], // the 123-word two-sentence reply
    [words(36), words(51)], // the 87-word one
    [words(45), words(34)], // the 79-word one
  ]) {
    const kept = sentencesWithinBudget([first, second], TALK_REPLY_WORD_BUDGET)
    const spoken = kept.reduce((n, s) => n + countWords(s), 0)
    assert.ok(spoken <= TALK_REPLY_WORD_BUDGET, `${spoken} words spoken, budget is ${TALK_REPLY_WORD_BUDGET}`)
  }
})

test('words are counted across newlines and runs of spaces', () => {
  assert.equal(countWords('one two\n\nthree    four'), 4)
  assert.equal(countWords('   '), 0)
})

test('admitsSentence is the per-sentence form of the same rule', () => {
  assert.ok(admitsSentence(0, words(99), 60), 'the first always goes')
  assert.ok(admitsSentence(30, words(30), 60), 'exactly on the budget fits')
  assert.ok(!admitsSentence(30, words(31), 60), 'one word over does not')
})

test('a short closing line survives, because it is the point of the turn', () => {
  // Measured: 52 words of advice, then a 12-word offer to rehearse, which
  // the budget used to delete whole.
  const advice = words(52)
  const offer = "Would you like to practise how you'd say that to his mum?"
  const kept = sentencesWithinBudget([advice, offer], TALK_REPLY_WORD_BUDGET)
  assert.equal(kept.length, 2, 'the offer is spoken')
  assert.ok(kept[1].includes('practise'))
})

test('the grace is one sentence, not a licence', () => {
  const kept = sentencesWithinBudget([words(55), words(10), words(10)], TALK_REPLY_WORD_BUDGET)
  assert.equal(kept.length, 2, 'the second short one is refused after the first overshoot')
})

test('a long closing line is still refused', () => {
  const kept = sentencesWithinBudget([words(55), words(40)], TALK_REPLY_WORD_BUDGET)
  assert.equal(kept.length, 1)
})

test('the grace cannot rescue a reply already past the budget', () => {
  // The first sentence alone blew it; nothing may follow.
  const kept = sentencesWithinBudget([words(80), words(5)], TALK_REPLY_WORD_BUDGET)
  assert.equal(kept.length, 1)
})
