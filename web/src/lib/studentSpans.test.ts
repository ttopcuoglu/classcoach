import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withStudentSpans } from './studentSpans.ts'

const seg = (id: string, speakerLabel: string, startSec: number, endSec: number, text: string) => ({ id, speakerLabel, rawSpeakerTag: '', startSec, endSec, text })

test('a student’s words come out of the teacher’s line as their own line', () => {
  const lines = [seg('a', 'Teacher', 60, 70, "What's the direction? It goes up and right. Good, up and right."), seg('b', 'Teacher', 75, 80, 'Next one.')]
  const out = withStudentSpans(lines, [{ lineStartSec: 60, startSec: 62.5, endSec: 66.7, text: 'It goes up and right.' }])
  assert.deepEqual(
    out.map((s) => [s.speakerLabel, s.text]),
    [
      ['Teacher', "What's the direction?"],
      ['Student', 'It goes up and right.'],
      ['Teacher', 'Good, up and right.'],
      ['Teacher', 'Next one.'],
    ],
  )
  assert.equal(new Set(out.map((s) => s.id)).size, out.length)
})

test('no spans, or words not in the line, leave the transcript as it was', () => {
  const lines = [seg('a', 'Teacher', 0, 5, 'Open your books.')]
  assert.equal(withStudentSpans(lines, undefined), lines)
  assert.deepEqual(withStudentSpans(lines, [{ lineStartSec: 0, startSec: 1, endSec: 2, text: 'not there at all' }]), lines)
})
