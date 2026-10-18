// The Lesson Debrief is built from the teacher's voice only.
//
// Every "student" number rests on one split: the teacher picks which diarized
// speaker is them, and every other voice becomes "Student". A student folded
// into the teacher's speaker is quoted as the teacher; the teacher's voice
// split across an untagged speaker, a video, or another adult is counted as
// students. Nothing can yet tell how large that error is on a given lesson,
// so every number built on it is off — the twin of the server's switch in
// server/src/lib/teacherVoice.ts. The values are still stored; turning this
// on needs no re-analysis.

import type { AudioCfuLogEntry, AudioQuestionLogEntry, AudioSessionWithSegments } from './api'
import type { ConfidentMetric } from './reportConfidence'

export const STUDENT_METRICS_ON = false

/// Listed at the foot of Insights, so a teacher can see what is missing
/// on purpose rather than wonder where it went.
export const NOT_IN_THIS_REPORT = [
  'how much students talked',
  'what students said',
  'how long students took to answer',
  'your pause after a student answered',
  'follow-ups to a student’s answer',
  'how often students used the lesson’s terms',
] as const

/// A pause long enough to count as holding the question open.
export const LONG_PAUSE_SEC = 3

const FOLLOW_UP_HIGHLIGHT = 'Follow-up / probing question'

/// The report's view of a lesson with every student-derived value removed.
///
/// Masked once, here, rather than checked at each place a number is drawn:
/// the strength picker, the focus card and the fallback sentences all read the
/// same fields, and a gate at the display would have to be remembered in
/// every one of them. Nulls already render as "not available" throughout.
///
/// Segments are left whole: the talk-flow chart needs to know where another
/// voice came in, and the transcript tab is the teacher's own record. Insights
/// quotes only the teacher's lines (lib/verbatim.ts, contextLines).
export function teacherVoiceView(session: AudioSessionWithSegments): AudioSessionWithSegments {
  if (STUDENT_METRICS_ON) return session
  return {
    ...session,
    studentTalkPct: null,
    avgWaitTimeSec: null,
    studentTalkFocus: null,
    metricsDetail: session.metricsDetail && {
      ...session.metricsDetail,
      waitTime2Sec: null,
      waitTime2SampleCount: 0,
      heldSilenceSec: null,
      heldSilenceSampleCount: 0,
      followUpQuestionCount: null,
    },
    questionLog: session.questionLog && questionsInOrder(session.questionLog),
    highlights: session.highlights && session.highlights.filter((h) => h.label !== FOLLOW_UP_HIGHLIGHT),
    // keyTerms keep their student counts: zeroing them would read as "no
    // student said it", which is a claim. The vocabulary list drops the
    // column instead (LessonContentTab).
  }
}

/// Every question the teacher asked, one entry each, in lesson order.
///
/// The phrase scan counts a follow-up as a question (questionCount) but files
/// it under the question it followed, so a list of the log's entries came out
/// shorter than the count beside it. A follow-up is found by a student answer
/// coming between two questions, which this report does not trust — so the
/// question stays, as a question, and only the "follow-up" reading goes. The
/// list and the count then agree on every lesson, whichever read produced it.
function questionsInOrder(log: AudioQuestionLogEntry[]): AudioQuestionLogEntry[] {
  const flat = log.flatMap((q) => [
    q,
    ...q.followUps.map(
      (f): AudioQuestionLogEntry => ({
        // Stored as full entries by the scan; typed narrower on the way out.
        type: (f as Partial<AudioQuestionLogEntry>).type ?? 'recall',
        pauseSec: (f as Partial<AudioQuestionLogEntry>).pauseSec ?? null,
        timestampSec: f.timestampSec,
        text: f.text,
        waitTimeSec: null,
        followUps: [],
      }),
    ),
  ])
  return flat
    .map((q) => ({ ...q, waitTimeSec: null, followUps: [] }))
    .sort((a, b) => a.timestampSec - b.timestampSec)
}

/// What follow-ups show while they are off: they are found by a teacher
/// question coming after a student's answer.
export const FOLLOW_UPS_OFF: ConfidentMetric = {
  state: 'not_measurable',
  display: '—',
  reason: 'Finding a follow-up needs a student’s answer to be heard, so it is not in this report.',
}

/// Past this a question counts as still open: the read looks no further.
export const HELD_OPEN_WINDOW_SEC = 120

/// Asked within this of a question the teacher answered themselves, a
/// thinking question is that same moment, and was never held open.
const SAME_MOMENT_SEC = 4

export type HeldOpenQuestion = {
  timestampSec: number
  text: string
  /// Null: still open after HELD_OPEN_WINDOW_SEC.
  sec: number | null
  closedBy: string | null
  how: 'confirmed' | 'gave_answer' | 'moved_on' | null
  /// Follow-ups asked while it was open.
  followUps: number
}

/// How long the teacher held thinking questions open: from the end of the
/// question to the first line that confirmed an answer, gave it, or moved
/// on. Only the questions the read counted as one of the six thinking kinds,
/// and not one the teacher answered themselves or set as a task. The typical value is the median, with a question still open
/// at the window counted at the window — so it can only understate.
export function heldOpenMetric(
  questionLog: AudioQuestionLogEntry[] | null,
  selfAnswered: { timestampSec: number }[] = [],
): ConfidentMetric & { typicalSec: number | null; long: number; questions: HeldOpenQuestion[]; tasks: HeldOpenQuestion[] } {
  const none = { typicalSec: null, long: 0, questions: [] as HeldOpenQuestion[], tasks: [] as HeldOpenQuestion[] }
  if (questionLog == null) return { state: 'not_measurable', display: '—', reason: 'Questions were not read for this lesson.', ...none }
  const higher = questionLog.filter((q) => q.type === 'higher_order')
  if (higher.length > 0 && higher.every((q) => q.heldOpen === undefined)) {
    return { state: 'not_measurable', display: '—', reason: 'This lesson was analyzed before this was read.', ...none }
  }
  const asQuestion = (q: AudioQuestionLogEntry): HeldOpenQuestion => ({
    timestampSec: q.timestampSec,
    text: q.text,
    sec: q.heldOpen!.outcome === 'open' ? null : q.heldOpen!.sec,
    closedBy: q.heldOpen!.closedBy,
    how: q.heldOpen!.how,
    followUps: q.heldOpen!.followUps?.length ?? 0,
  })
  const answeredNear = (q: AudioQuestionLogEntry) =>
    selfAnswered.some((s) => Math.abs(s.timestampSec - q.timestampSec) <= SAME_MOMENT_SEC)
  const questions = higher
    .filter((q) => (q.heldOpen?.outcome === 'closed' || q.heldOpen?.outcome === 'open') && !answeredNear(q))
    .map(asQuestion)
  // Set as work rather than held open for the room: listed, never timed.
  const tasks = higher.filter((q) => q.heldOpen?.outcome === 'task').map(asQuestion)
  if (questions.length === 0) {
    return tasks.length > 0
      ? { state: 'not_measurable', display: '—', reason: 'Your thinking questions this lesson were set as tasks.', ...none, tasks }
      : { state: 'confirmed_none', display: '0', reason: 'No thinking questions this lesson.', ...none }
  }
  const secs = questions.map((q) => q.sec ?? HELD_OPEN_WINDOW_SEC).sort((a, b) => a - b)
  const mid = Math.floor(secs.length / 2)
  const median = secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2
  const typicalSec = Math.round(median)
  const long = secs.filter((s) => s >= LONG_PAUSE_SEC).length
  return {
    state: 'measured',
    display: typicalSec >= HELD_OPEN_WINDOW_SEC ? '2 min+' : `${typicalSec}s`,
    typicalSec,
    long,
    questions,
    tasks,
  }
}

/// The checks the report counts: every logged check, except ones the checks
/// read found were not checks after all (rhetorical, logistics). One number
/// for Insights, Summary and the export.
export function realChecks<T extends AudioCfuLogEntry>(cfuLog: T[] | null): T[] | null {
  return cfuLog ? cfuLog.filter((c) => c.loop?.who !== 'not_a_check') : null
}

/// The held-open measure as one stat tile: the typical seconds, shown with an
/// "s" unit, and the reason in place of a number when there is none — a
/// lesson with no thinking questions has no typical time, not a time of 0.
export const HELD_OPEN_LABEL = 'Thinking questions held open (typical)'
export function heldOpenStat(
  questionLog: AudioQuestionLogEntry[] | null,
  selfAnswered: { timestampSec: number }[] = [],
): ConfidentMetric {
  const m = heldOpenMetric(questionLog, selfAnswered)
  if (m.state !== 'measured' || m.typicalSec == null) {
    return { state: 'not_measurable', display: '—', reason: m.reason }
  }
  return {
    state: 'measured',
    display: m.typicalSec >= HELD_OPEN_WINDOW_SEC ? `${HELD_OPEN_WINDOW_SEC}+` : String(m.typicalSec),
  }
}
