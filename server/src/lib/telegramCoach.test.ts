import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCompleteReflection } from './telegramCoach.ts'

// The rule that decides whether a single message gets offered a takeaway.
// Getting it wrong in one direction nags a teacher who was mid-sentence;
// in the other, the one reflection worth keeping quietly becomes nothing.

const OPENER = 'my 3rd period was a disaster today, they would not stop talking during the notes'

const VOICE_NOTE =
  "Okay so third period again. I started the notes and within about two minutes the back four were talking over me, " +
  "and I did the thing I always do where I just raise my voice and push through it, which never works. By the time I " +
  "got to the practice problems I'd lost maybe half the room and I was already annoyed, which I know they could hear. " +
  "The weird part is first period had the exact same lesson and it was fine, so it isn't the material."

test('a long first message is a reflection worth wrapping up', () => {
  assert.ok(VOICE_NOTE.length >= 400, 'fixture should be a realistic length')
  assert.equal(isCompleteReflection(VOICE_NOTE, 0), true)
})

test('an opening line is not', () => {
  assert.equal(isCompleteReflection(OPENER, 0), false)
})

test('a long message mid-conversation is left to the sweep', () => {
  // Two exchanges in, the thirty-minute offer already covers it, and a
  // button on every long turn would be a nag.
  assert.equal(isCompleteReflection(VOICE_NOTE, 2), false)
})

test('whitespace is not substance', () => {
  assert.equal(isCompleteReflection(`${OPENER}${' '.repeat(500)}`, 0), false)
})
