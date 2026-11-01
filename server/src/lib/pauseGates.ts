// Whether a lesson's two student-anchored pause measures can be shown:
//
//   - wait time: from a question to a student's answer (avgWaitTimeSec)
//   - the pause after an answer: from a student finishing to the teacher
//     speaking again (metricsDetail.waitTime2Sec)
//
// Both numbers were already worked out once, at analysis. What was copied
// into eight places — the report, the export, the iPhone, My Growth, the
// principal dashboard, the coach — was the decision whether to SHOW one, and
// the copies disagreed: the report hid a pause after an answer resting on two
// answers while the coach was told it. This is that decision, made once when
// the lesson is analysed and stored beside the numbers; every reader follows
// it. It fails closed: no number without enough separated answers.
//
// Version 2 dropped hiding them when answers also turned up inside the
// teacher's lines: the three-answer floor already covers the lessons where
// that mattered, and it hid figures resting on twenty real answers.

export const PAUSE_GATES_VERSION = 2

/// Below this many answers an average is a reading of one or two moments,
/// which nothing in this product treats as a habit.
export const MIN_ANSWER_SAMPLES = 3

/// 'answers_in_teacher_voice' is no longer given (version 1 only); kept so a
/// decision stored then still reads.
export type PauseGateReason = 'no_student_voice' | 'answers_in_teacher_voice' | 'not_counted' | 'no_answers_heard' | 'too_few_answers'

export type PauseGate = { shown: true } | { shown: false; reason: PauseGateReason }

export type PauseGates = {
  version: number
  waitTime: PauseGate
  waitTime2: PauseGate
}

type Detail = { studentVoiceSegments?: unknown; waitTimeSampleCount?: unknown; waitTime2SampleCount?: unknown }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const counted = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function gateOf(samples: unknown, noStudents: boolean): PauseGate {
  if (noStudents) return { shown: false, reason: 'no_student_voice' }
  // Analysed before the answers behind the average were counted: there is no
  // telling one answer from twenty.
  if (!counted(samples)) return { shown: false, reason: 'not_counted' }
  if (samples === 0) return { shown: false, reason: 'no_answers_heard' }
  if ((samples as number) < MIN_ANSWER_SAMPLES) return { shown: false, reason: 'too_few_answers' }
  return { shown: true }
}

export function pauseGatesOf(metricsDetail: unknown): PauseGates {
  const d = (metricsDetail ?? {}) as Detail
  const noStudents = num(d.studentVoiceSegments) === 0
  return {
    version: PAUSE_GATES_VERSION,
    waitTime: gateOf(d.waitTimeSampleCount, noStudents),
    waitTime2: gateOf(d.waitTime2SampleCount, noStudents),
  }
}

/// The stored decision for one measure. A lesson analysed before it was
/// stored has none, and reads as not shown: no reader falls back to a rule
/// of its own.
export function storedGate(metricsDetail: unknown, measure: 'waitTime' | 'waitTime2'): PauseGate {
  const gates = (metricsDetail as { pauseGates?: Partial<PauseGates> } | null)?.pauseGates
  const gate = gates?.[measure]
  if (gate && typeof gate === 'object' && typeof gate.shown === 'boolean') return gate
  return { shown: false, reason: 'no_answers_heard' }
}

/// Wait time after a question, only where it may be shown.
export function shownWaitTime(row: { avgWaitTimeSec: number | null; metricsDetail?: unknown }): number | null {
  return storedGate(row.metricsDetail, 'waitTime').shown ? row.avgWaitTimeSec : null
}

/// The pause after a student's answer, only where it may be shown.
export function shownWaitTime2(metricsDetail: unknown): number | null {
  const v = (metricsDetail as { waitTime2Sec?: unknown } | null)?.waitTime2Sec
  return storedGate(metricsDetail, 'waitTime2').shown && typeof v === 'number' ? v : null
}
