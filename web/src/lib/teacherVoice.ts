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

import type { AudioQuestionLogEntry, AudioSessionWithSegments } from './api'
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

/// How many questions had LONG_PAUSE_SEC or more before the teacher spoke
/// again, out of the questions where that could be timed.
///
/// The teacher-voice stand-in for wait time. It runs from the end of the
/// question to the teacher's next line, so it may contain a student's answer
/// and is never called think time.
export function pauseAfterQuestionsMetric(questionLog: AudioQuestionLogEntry[] | null): ConfidentMetric & {
  long: number
  timed: number
} {
  const timed = (questionLog ?? []).filter((q) => typeof q.pauseSec === 'number')
  const long = timed.filter((q) => (q.pauseSec as number) >= LONG_PAUSE_SEC).length
  if (timed.length === 0) {
    return {
      state: 'not_measurable',
      display: '—',
      reason:
        questionLog == null || questionLog.every((q) => q.pauseSec === undefined)
          ? 'This lesson was analyzed before pauses were timed.'
          : 'No question here could be timed against the next thing you said.',
      long,
      timed: 0,
    }
  }
  return {
    state: long === 0 ? 'confirmed_none' : 'measured',
    display: `${long} of ${timed.length}`,
    long,
    timed: timed.length,
  }
}
