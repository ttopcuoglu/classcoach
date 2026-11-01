// Whether a lesson's wait time and pause after an answer may be shown, as the
// server decided when the lesson was analysed (server lib/pauseGates.ts).
// Read here, never decided here: the report, the export, highlights and My
// Growth all follow the one stored decision, so none of them can show a
// number another hides.

import type { AudioSession, PauseGate, PauseGateReason } from './api'

export type PauseMeasure = 'waitTime' | 'waitTime2'

type GateSession = Pick<AudioSession, 'metricsLogs'>

/// The stored decision; a lesson analysed before it was stored has none and
/// reads as not shown.
export function storedGate(session: GateSession, measure: PauseMeasure): PauseGate | null {
  const gate = session.metricsLogs?.pauseGates?.[measure]
  return gate && typeof gate.shown === 'boolean' ? gate : null
}

const sampleKey: Record<PauseMeasure, string> = { waitTime: 'waitTimeSampleCount', waitTime2: 'waitTime2SampleCount' }

/// Why a pause isn't shown, in the words every card uses.
export function pauseHiddenReason(session: GateSession & Pick<AudioSession, 'metricsDetail'>, measure: PauseMeasure): string {
  const gate = storedGate(session, measure)
  if (!gate) return 'Not worked out for this lesson yet.'
  if (gate.shown) return ''
  const n = (session.metricsDetail as Record<string, unknown> | null)?.[sampleKey[measure]]
  const count = typeof n === 'number' ? n : 0
  const text: Record<PauseGateReason, string> = {
    no_student_voice: 'No student voice was told apart from yours in this recording, so there was no answer to time against.',
    answers_in_teacher_voice:
      'Students’ answers were recorded as your voice, so the few answers that were told apart can’t stand for the lesson.',
    not_counted: 'This lesson was analysed before the answers behind it were counted, so it can’t be checked.',
    no_answers_heard:
      measure === 'waitTime'
        ? 'None of your questions was followed by an audible student answer, so there was no pause to time.'
        : 'No audible student answer was followed by you speaking, so there was no pause to time.',
    too_few_answers: `Only ${count} answer${count === 1 ? '' : 's'} could be timed, too few to read as a habit.`,
  }
  return text[gate.reason]
}

/// Wait time after a question, only where it may be shown.
export function shownWaitTime(session: GateSession & Pick<AudioSession, 'avgWaitTimeSec'>): number | null {
  return storedGate(session, 'waitTime')?.shown ? (session.avgWaitTimeSec ?? null) : null
}

/// The pause after a student's answer, only where it may be shown.
export function shownWaitTime2(session: GateSession & Pick<AudioSession, 'metricsDetail'>): number | null {
  const v = (session.metricsDetail as Record<string, unknown> | null)?.waitTime2Sec
  return storedGate(session, 'waitTime2')?.shown && typeof v === 'number' ? v : null
}
