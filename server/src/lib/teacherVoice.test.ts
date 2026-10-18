import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QuestionLogEntry } from './audioAnalysis.ts'
import { heldOpenSummary, STUDENT_METRICS_ON } from './teacherVoice.ts'
import { buildClassSummarySystemPrompt, type ClassSummaryMetrics } from '../routes/audioSessions.ts'

// While student metrics are off, the coach notes must not be handed numbers
// the page no longer shows — a note citing "students at 8%" beside a page
// with no student share is the contradiction this exists to prevent.

const q = (timestampSec: number, type: 'recall' | 'higher_order', sec: number | null | undefined): QuestionLogEntry => ({
  timestampSec,
  type,
  waitTimeSec: null,
  pauseSec: null,
  studentAudibleInPause: false,
  text: 'What did you notice?',
  followUps: [],
  ...(sec !== undefined
    ? {
        heldOpen: {
          outcome: sec == null ? ('open' as const) : ('closed' as const),
          questionType: 'explain' as const,
          sec,
          closedBy: sec == null ? null : 'Right.',
          closedAtSec: null,
          how: sec == null ? null : ('confirmed' as const),
        },
      }
    : {}),
})

test('held open: thinking questions only, median, still-open counted at the window', () => {
  const log = [q(0, 'recall', 40), q(10, 'higher_order', 2), q(60, 'higher_order', 8), q(200, 'higher_order', null), q(300, 'higher_order', 1)]
  // The one at 300s was answered in the same breath, so it is left out.
  assert.deepEqual(heldOpenSummary(log, [{ timestampSec: 301 }]), { typicalSec: 8, long: 2, questions: 3 })
  assert.equal(heldOpenSummary([q(0, 'higher_order', undefined)]), null, 'not read yet')
  assert.equal(heldOpenSummary(null), null)
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
  heldOpen: { typicalSec: 7, long: 4, questions: 6 },
}

test('with student metrics off, the prompt carries no student number', { skip: STUDENT_METRICS_ON }, () => {
  const prompt = buildClassSummarySystemPrompt([{ text: 'Today we start personal narratives.', timestampSec: 0 }], 900, METRICS)
  assert.ok(!prompt.includes('student talk: 17.9'), 'student share')
  assert.ok(!prompt.includes('1.8s'), 'wait time before an answer')
  assert.ok(!prompt.includes('0.4s'), 'pause after an answer')
  assert.ok(!prompt.includes('What the student talk was about'), 'student talk focus')
  assert.ok(prompt.includes('typically 7 seconds; 4 of 6 were held'), 'the teacher-voice pause')
  assert.ok(prompt.includes("built from the teacher's voice only"))
})
