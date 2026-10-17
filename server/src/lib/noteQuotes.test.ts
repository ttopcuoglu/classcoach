import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Segment } from './audioAnalysis.ts'
import { noteQuotesAreReal } from '../routes/audioSessions.ts'

// The guard that replaced "paraphrase only". That rule was the only thing
// standing between a teacher and a sentence they never said; swapping it for
// an instruction to quote carefully is not the same as a check.

const SEGMENTS: Segment[] = [
  { speakerLabel: 'Teacher', startSec: 10, endSec: 16, text: "I'm not the answer. Take a guess." },
  { speakerLabel: 'Teacher', startSec: 40, endSec: 48, text: 'Who can build on what she just said?' },
  { speakerLabel: 'Student', startSec: 20, endSec: 26, text: 'Because there were fewer workers left.' },
]

test('a note quoting what the teacher actually said passes', () => {
  assert.equal(noteQuotesAreReal('You said “I’m not the answer. Take a guess.” at 0:10.', SEGMENTS), true)
})

test('a note quoting something never said is rejected', () => {
  assert.equal(noteQuotesAreReal('You said “Everyone please settle down now.” at 0:10.', SEGMENTS), false)
})

test('a tidied-up quote is still a quote the teacher did not say', () => {
  // The likeliest failure by far: a model that fixes the grammar.
  assert.equal(noteQuotesAreReal('You said “I am not the answer, take a guess.” there.', SEGMENTS), false)
})

test('a student sentence is not the teacher’s to quote', () => {
  assert.equal(noteQuotesAreReal('You said “Because there were fewer workers left.”', SEGMENTS), false)
})

test('a note with no quotes passes', () => {
  assert.equal(noteQuotesAreReal('Your questions leaned recall today, with one followed up.', SEGMENTS), true)
})

test('a null note passes — nothing to check', () => {
  assert.equal(noteQuotesAreReal(null, SEGMENTS), true)
})

test('straight quotes are checked too, not just curly ones', () => {
  assert.equal(noteQuotesAreReal('You said "Everyone please settle down now." there.', SEGMENTS), false)
  assert.equal(noteQuotesAreReal('You said "Who can build on what she just said?" there.', SEGMENTS), true)
})

test('a short quoted word is not treated as a claim about speech', () => {
  // "abandoned" in quotes is a term being highlighted, not a sentence being
  // attributed. Rejecting a whole note over it would lose good writing.
  assert.equal(noteQuotesAreReal('You unpacked the word “abandoned” carefully.', SEGMENTS), true)
})

test('punctuation drift passes, and that is deliberate', () => {
  // The boundary of this guard, written down so it is a decision rather than
  // a surprise. Changed WORDS are caught; a comma for a full stop is not.
  // Rejecting a real moment over punctuation was tried elsewhere here and
  // turned a genuine stated objective into "not said aloud".
  assert.equal(noteQuotesAreReal('You said “I\u2019m not the answer, take a guess.”', SEGMENTS), true)
})
