import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pauseGatesOf, shownWaitTime, shownWaitTime2, storedGate } from './pauseGates.ts'

const clean = { foldedCount: 0, questionCount: 10 }

test('three or more answers, with students told apart, may be shown', () => {
  const g = pauseGatesOf({ studentVoiceSegments: 20, waitTimeSampleCount: 3, waitTime2SampleCount: 8 }, clean)
  assert.deepEqual(g.waitTime, { shown: true })
  assert.deepEqual(g.waitTime2, { shown: true })
})

test('fewer than three answers is too few, and none is none', () => {
  const g = pauseGatesOf({ studentVoiceSegments: 20, waitTimeSampleCount: 0, waitTime2SampleCount: 2 }, clean)
  assert.deepEqual(g.waitTime, { shown: false, reason: 'no_answers_heard' })
  assert.deepEqual(g.waitTime2, { shown: false, reason: 'too_few_answers' })
})

test('a lesson analysed before answers were counted is not shown, and says why', () => {
  const g = pauseGatesOf({ studentVoiceSegments: 20, waitTime2SampleCount: 5 }, clean)
  assert.deepEqual(g.waitTime, { shown: false, reason: 'not_counted' })
  assert.deepEqual(g.waitTime2, { shown: true })
})

test('no student voice hides both, whatever the counts', () => {
  const g = pauseGatesOf({ studentVoiceSegments: 0, waitTimeSampleCount: 5, waitTime2SampleCount: 5 }, clean)
  assert.equal(g.waitTime.shown, false)
  assert.deepEqual(g.waitTime2, { shown: false, reason: 'no_student_voice' })
})

// The coordinate-plane lesson: 9 of 18 questions answered inside the teacher's lines.
test("answers in the teacher's voice hide both, even with enough samples", () => {
  const g = pauseGatesOf({ studentVoiceSegments: 7, waitTimeSampleCount: 4, waitTime2SampleCount: 4 }, { foldedCount: 9, questionCount: 18 })
  assert.deepEqual(g.waitTime, { shown: false, reason: 'answers_in_teacher_voice' })
  assert.deepEqual(g.waitTime2, { shown: false, reason: 'answers_in_teacher_voice' })
})

test('readers get the number only where it may be shown, and nothing from a lesson with no decision stored', () => {
  const shown = { waitTime2Sec: 1.4, pauseGates: { version: 1, waitTime: { shown: true }, waitTime2: { shown: false, reason: 'too_few_answers' } } }
  assert.equal(shownWaitTime({ avgWaitTimeSec: 2.2, metricsDetail: shown }), 2.2)
  assert.equal(shownWaitTime2(shown), null)
  assert.equal(shownWaitTime({ avgWaitTimeSec: 2.2, metricsDetail: { waitTimeSampleCount: 9 } }), null)
  assert.equal(storedGate(null, 'waitTime').shown, false)
})
