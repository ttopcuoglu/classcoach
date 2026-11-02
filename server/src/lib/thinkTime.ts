// Think Time: after each question the teacher asked, how long the room was
// quiet before anyone said a word — the teacher or a student, it does not
// matter who. Averaged over the lesson's questions.
//
// It never asks who spoke, so it holds on a recording where students were
// not told apart from the teacher, which Teacher Pause cannot (it needs to
// know whose sentence ended the pause). That is why it is the Summary's tile.
//
// How exact it is: the transcript times lines, not words, and a line is split
// wherever the speaker stopped for longer than a moment (Deepgram's utterance
// split, under a second). So a quiet that runs to the next line is timed
// exactly, from the line times; a question followed by more words on the same
// line was followed within that moment, and is timed by the words' places in
// the line — a fraction of a second, which is what it was.
//
// Worked out once, when the lesson is analysed, and stored like Teacher Pause
// (teacherPause.ts): web and iPhone only show it.

import { countedQuestions } from './questionMix.ts'
import { askedQuestion } from './teacherPause.ts'

/// Bumped whenever the arithmetic changes; a stored figure keeps the rules it
/// was made with until a deliberate backfill moves it.
export const THINK_TIME_VERSION = 1

/// A quiet longer than this after a question is independent work or a hole in
/// the recording, not time to think about the question.
const MAX_THINK_SEC = 30

type Seg = { speakerLabel: string; startSec: number; endSec: number; text: string }

export type ThinkTimeReason = 'no_questions' | 'none_timed'

export type ThinkTime = {
  version: number
  /// Average of the timed questions, to a tenth; null with a reason.
  average: number | null
  reason: ThinkTimeReason | null
  /// Every counted question, in order, with its quiet (null where it could
  /// not be timed).
  questions: { timestampSec: number; sec: number | null }[]
}

/// The quiet after one question: from where it ends to the next word anyone
/// said. Null where the question cannot be placed, or nothing followed in time.
function quietAfter(ordered: Seg[], t: number, quote: string): number | null {
  const asked = askedQuestion(ordered, t, quote)
  if (!asked) return null
  const next = asked.turn[asked.at]?.startSec ?? ordered[asked.end + 1]?.startSec
  if (next == null) return null
  const sec = Math.max(0, Math.round((next - asked.askedEnd) * 10) / 10)
  return sec > MAX_THINK_SEC ? null : sec
}

export function thinkTimeOf(segments: Seg[], questionLog: unknown, teachingMoves: unknown): ThinkTime {
  const ordered = segments.filter((s) => s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  const { questions: counted } = countedQuestions(questionLog, teachingMoves)
  const questions = counted.map((q) => ({ timestampSec: q.timestampSec, sec: quietAfter(ordered, q.timestampSec, q.text) }))
  const base = { version: THINK_TIME_VERSION, questions }
  if (questions.length === 0) return { ...base, average: null, reason: 'no_questions' }
  const timed = questions.filter((q) => q.sec != null).map((q) => q.sec as number)
  if (timed.length === 0) return { ...base, average: null, reason: 'none_timed' }
  return { ...base, average: Math.round((timed.reduce((a, b) => a + b, 0) / timed.length) * 10) / 10, reason: null }
}
