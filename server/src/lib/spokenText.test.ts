import { strict as assert } from 'node:assert'
import test from 'node:test'
import { stripStageDirections } from './spokenText.ts'

test('ordinary text is untouched', () => {
  const plain = "That dread makes sense, and freezing on a call like this is common."
  assert.equal(stripStageDirections(plain), plain)
})

test('a stage direction between sentences is removed, not spoken', () => {
  assert.equal(
    stripStageDirections("Okay, I'll be her. *Sharp voice* Hi. My son says you've been picking on him."),
    "Okay, I'll be her. Hi. My son says you've been picking on him.",
  )
  assert.equal(
    stripStageDirections('Nice, you named him calmly. *Still sharp* Why do you keep going after him?'),
    'Nice, you named him calmly. Why do you keep going after him?',
  )
})

test('a stage direction opening the reply is removed', () => {
  assert.equal(stripStageDirections('*As the parent* You never listen to me.'), 'You never listen to me.')
})

test('emphasis inside a sentence keeps its word — removing it would invert the meaning', () => {
  assert.equal(
    stripStageDirections("That's *not* what I meant."),
    "That's not what I meant.",
  )
  assert.equal(stripStageDirections('Say it **before** they sit down.'), 'Say it before they sit down.')
})

test('no asterisk survives for the voice to read out', () => {
  for (const input of [
    "Okay. *Sharp voice* Hi.",
    "That's *not* it.",
    '*As her* What are you going to do?',
    'Try **this** instead.',
  ]) {
    assert.ok(!stripStageDirections(input).includes('*'), `left an asterisk: ${input}`)
  }
})

test('spacing is cleaned up after a removal', () => {
  assert.equal(stripStageDirections('Okay, I will be her.  *Sharp*  Hi there.'), 'Okay, I will be her. Hi there.')
  assert.ok(!stripStageDirections('Fine. *Beat* Yes.').includes('  '))
})

// The regression that produced "the script is on screen but Coach went
// quiet". Sentences are emitted while the reply is still being written, and
// reconcileTail only sends the remainder if what was already spoken is a
// prefix of the finished reply. Stripping the PARTIAL stream broke that:
// an asterisk span straddling a sentence boundary is untouched while its
// closing "*" is unwritten and unwrapped once it lands, so a sentence
// already sent stopped being a prefix and the rest of the turn was dropped.
//
// The fix is that nothing strips the growing stream any more. These pin the
// property that made it safe: the text the queue reconciles on is the
// untouched text, and stripping happens per finished sentence.
test('stripping a partial stream is NOT prefix-stable — which is why it is no longer done', () => {
  const partial = "I'll be her. *She sounds tired."
  const whole = "I'll be her. *She sounds tired. And impatient.* Go ahead."
  // The dangerous property, asserted so nobody reintroduces the old call site.
  assert.equal(stripStageDirections(whole).startsWith(stripStageDirections(partial)), false)
})

test('untouched sentences stay a prefix of the untouched reply, so nothing is dropped', async () => {
  const { reconcileTail } = await import('./sentenceStream.ts')
  const reply = "I'll be her. *She sounds tired. And impatient.* Go ahead."
  // What the stream actually pushes to `spoken` now: the raw sentences.
  const spoken = ["I'll be her.", '*She sounds tired.', 'And impatient.*']
  const tail = reconcileTail(spoken, reply)
  assert.equal(tail, 'Go ahead.', 'the remainder must still be spoken')
  // And what reaches the teacher's ear carries no asterisk.
  assert.ok(!stripStageDirections(tail).includes('*'))
  for (const s of spoken) assert.ok(!stripStageDirections(s).includes('*'))
})
