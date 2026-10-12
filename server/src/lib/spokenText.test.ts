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
