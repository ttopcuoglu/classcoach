import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuestionLogEntry } from './audioAnalysis.ts'
import { pauseAfterQuestions, STUDENT_METRICS_ON } from './teacherVoice.ts'
import { buildClassSummarySystemPrompt, type ClassSummaryMetrics } from '../routes/audioSessions.ts'

// While student metrics are off, the coach notes must not be handed numbers
// the page no longer shows — a note citing "students at 8%" beside a page
// with no student share is the contradiction this exists to prevent.

const q = (pauseSec: number | null): QuestionLogEntry => ({
  timestampSec: 0,
  type: 'recall',
  waitTimeSec: null,
  pauseSec,
  studentAudibleInPause: false,
  text: 'What did you notice?',
  followUps: [],
})

test('pauses count only the questions that could be timed', () => {
  assert.deepEqual(pauseAfterQuestions([q(0.4), q(3), q(5.2), q(null)]), { long: 2, timed: 3 })
  assert.deepEqual(pauseAfterQuestions(null), { long: 0, timed: 0 })
})

const METRICS: ClassSummaryMetrics = {
  teacherTalkPct: 41.2,
  studentTalkPct: 17.9,
  questionCount: 15,
  higherOrderPct: 40,
  higherOrderCount: 6,
  avgWaitTimeSec: 1.8,
  cfuCount: 2,
  studentVoiceDetected: true,
  waitTime2Sec: 0.4,
  waitTime2SampleCount: 6,
  studentTalkFocus: { classified: 20, onTopic: 12, procedural: 4, offTopic: 2, unclear: 2 },
  pauseAfterQuestions: { long: 2, timed: 12 },
}

test('with student metrics off, the prompt carries no student number', { skip: STUDENT_METRICS_ON }, () => {
  const prompt = buildClassSummarySystemPrompt([{ text: 'Today we start personal narratives.', timestampSec: 0 }], 900, METRICS)
  assert.ok(!prompt.includes('student talk: 17.9'), 'student share')
  assert.ok(!prompt.includes('1.8s'), 'wait time before an answer')
  assert.ok(!prompt.includes('0.4s'), 'pause after an answer')
  assert.ok(!prompt.includes('What the student talk was about'), 'student talk focus')
  assert.ok(prompt.includes('2 of 12 that could be timed'), 'the teacher-voice pause')
  assert.ok(prompt.includes("built from the teacher's voice only"))
})
