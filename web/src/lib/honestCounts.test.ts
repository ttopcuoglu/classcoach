import { strict as assert } from 'node:assert'
import test from 'node:test'
import type { AudioQuestionLogEntry, AudioSessionWithSegments } from './api.ts'
import { evidenceLabel, formatRatio } from './reportConfidence.ts'
import { teacherVoiceView } from './teacherVoice.ts'

test('a count below three is instances, never a pattern', () => {
  assert.equal(evidenceLabel({ state: 'measured', display: '1' }), '1 instance')
  assert.equal(evidenceLabel({ state: 'measured', display: '2' }), '2 instances')
  assert.equal(evidenceLabel({ state: 'measured', display: '3' }), 'Clear pattern')
  assert.equal(evidenceLabel({ state: 'possible_detection', display: '4 of 7' }), '4 instances')
  assert.equal(evidenceLabel({ state: 'confirmed_none', display: '0' }), 'None heard')
  assert.equal(evidenceLabel({ state: 'measured', display: '34.3' }), 'Measured')
  assert.equal(evidenceLabel({ state: 'not_measurable', display: '—' }), 'Not enough evidence yet')
})

test('a ratio of events is a fraction at any size', () => {
  assert.equal(formatRatio(6, 15).display, '6 of 15')
  assert.equal(formatRatio(2, 5).display, '2 of 5')
})

test('the question list has one entry per counted question', () => {
  // The phrase scan files a follow-up under the question it followed, while
  // counting it in questionCount — two questions, one list entry.
  const followUp = { timestampSec: 40, text: 'And why would that be?', type: 'higher_order', pauseSec: 2 }
  const log: AudioQuestionLogEntry[] = [
    { timestampSec: 10, type: 'recall', waitTimeSec: 1.2, pauseSec: 3.1, text: 'What did we find?', followUps: [followUp] },
  ]
  const view = teacherVoiceView({ questionLog: log, questionCount: 2 } as unknown as AudioSessionWithSegments)
  assert.equal(view.questionLog?.length, 2)
  assert.deepEqual(
    view.questionLog?.map((q) => [q.timestampSec, q.type, q.followUps.length, q.waitTimeSec]),
    [
      [10, 'recall', 0, null],
      [40, 'higher_order', 0, null],
    ],
  )
})
