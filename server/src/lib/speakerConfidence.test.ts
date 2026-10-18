import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doubtfulWords, keepConfident, speakerConfidenceRuns } from './deepgram.ts'

const w = (speaker_confidence: number) => ({ word: 'x', speaker: 0, speaker_confidence })

test('words group into runs, so a second voice inside a line still shows', () => {
  // The synthetic clip: the teacher's words at 0.76, then another voice's at
  // 0.11, all in one line labelled one speaker.
  assert.deepEqual(speakerConfidenceRuns([w(0.761), w(0.758), w(0.76), w(0.11), w(0.112)]), [
    [3, 0.76],
    [2, 0.11],
  ])
})

test('no per-word confidence is null, not a guess', () => {
  assert.equal(speakerConfidenceRuns(undefined), null)
  assert.equal(speakerConfidenceRuns([]), null)
  assert.equal(speakerConfidenceRuns([{ word: 'x', speaker: 0 }]), null)
})

test('doubtful words are flagged per word, and only when the runs fit the text', () => {
  const text = 'Take a second. Because the earth'
  const doubt = doubtfulWords(text, [[3, 0.76], [3, 0.11]])
  assert.deepEqual(doubt, [false, false, false, true, true, true])
  assert.equal(keepConfident(text.split(' '), doubt), 'Take a second. …')
  assert.equal(doubtfulWords(text, [[4, 0.76]]), null, 'runs that do not fit the words are not used')
  assert.equal(doubtfulWords(text, null), null)
  assert.equal(keepConfident(['a', 'b'], [true, true]), '')
})
