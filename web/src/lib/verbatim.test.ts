import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { TranscriptSegment } from './api.ts'
import { resolveVerbatim, teacherRuns } from './verbatim.ts'

const seg = (id: string, speakerLabel: string, startSec: number, endSec: number, text: string): TranscriptSegment => ({
  id,
  speakerLabel,
  rawSpeakerTag: speakerLabel,
  startSec,
  endSec,
  text,
})

const SEGMENTS = [
  seg('a', 'Teacher', 10, 12, 'Alright.'),
  seg('b', 'Teacher', 12.4, 13, 'So'),
  seg('c', 'Teacher', 13.2, 17, "we're going to make a list as a class, now?"),
  seg('d', 'Student', 18, 19, 'Can we use our notes?'),
  seg('e', 'Teacher', 20, 24, 'Yes. Anybody else have a character who is unnamed?'),
  seg('f', 'Teacher', 40, 44, 'Okay, keep working on it.'),
]
const runs = teacherRuns(SEGMENTS)

test('the shown words are the transcript’s, not the model’s tidied copy', () => {
  // The model dropped the apostrophe and the question mark.
  const hit = resolveVerbatim(runs, 'Anybody else have a character who is unnamed', 20)
  assert.deepEqual(hit, { text: 'Anybody else have a character who is unnamed?', segmentId: 'e', endSegmentId: 'e' })
})

test('one sentence split by the transcriber across back-to-back lines is one quote', () => {
  const hit = resolveVerbatim(runs, 'So we are going to make a list', 12.4)
  assert.equal(hit, null, 'a word the teacher did not say is not tidied into a match')
  const real = resolveVerbatim(runs, "So we're going to make a list as a class", 12.4)
  assert.deepEqual(real, { text: "So we're going to make a list as a class,", segmentId: 'b', endSegmentId: 'c' })
})

test('lines another voice came between are never joined', () => {
  assert.equal(resolveVerbatim(runs, 'as a class, now? Yes. Anybody else', 13.2), null)
})

test('a long pause ends the stretch too', () => {
  assert.equal(resolveVerbatim(runs, 'unnamed? Okay, keep working on it', 20), null)
})

test('a quote matches whole words only', () => {
  assert.equal(resolveVerbatim(runs, 'eep working on i', 40), null)
})
