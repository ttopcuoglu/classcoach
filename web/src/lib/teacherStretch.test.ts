import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { TranscriptSegment } from './api.ts'
import { longestTeacherStretch } from './teacherStretch.ts'

const seg = (speakerLabel: string, startSec: number, endSec: number, text = 'words'): TranscriptSegment => ({
  id: `${speakerLabel}-${startSec}`,
  speakerLabel,
  rawSpeakerTag: '',
  startSec,
  endSec,
  text,
})

test('a stretch ends at another voice or a long pause, and runs first word to last', () => {
  const s = longestTeacherStretch([
    seg('Teacher', 0, 20, 'Okay, today we start fractions.'),
    seg('Teacher', 22, 60),
    seg('Student', 61, 63, 'What?'),
    seg('Teacher', 64, 70),
    seg('Teacher', 100, 200, 'Here are the directions.'), // 30s pause before: a new stretch
    seg('Teacher', 205, 230),
  ])!
  assert.equal(s.startSec, 100)
  assert.equal(s.durationSec, 130)
  assert.equal(s.opening, 'Here are the directions.')
  assert.equal(longestTeacherStretch([seg('Student', 0, 5)]), null)
})
