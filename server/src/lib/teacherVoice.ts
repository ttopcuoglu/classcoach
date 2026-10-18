import type { QuestionLogEntry } from './audioAnalysis.ts'

// The Lesson Debrief is built from the teacher's voice only.
//
// Every "student" number rests on one split: the teacher picks which
// diarized speaker is them, and every other voice becomes "Student". A
// student whose voice Deepgram folded into the teacher's speaker is quoted as
// the teacher; the teacher's own voice split across an untagged speaker, a
// video, or another adult is counted as students. Student talk share, wait
// time before an answer, the pause after an answer, follow-ups and the
// vocabulary "Students" column all inherit that error, and nothing here can
// tell how large it is on a given lesson.
//
// So they are off until a speaker-separation check exists that can say, per
// lesson, that the split is trustworthy. This is the one switch; the web has
// its twin in web/src/lib/teacherVoice.ts. The numbers are still computed and
// stored, so turning it on later needs no re-analysis.
export const STUDENT_METRICS_ON = false

/// A pause long enough to count as holding the question open.
export const LONG_PAUSE_SEC = 3

/// Past this a thinking question counts as still open: the read looks no
/// further (lib/heldOpen.ts).
const HELD_OPEN_WINDOW_SEC = 120

/// Asked within this of a question the teacher answered themselves, a
/// thinking question is that same moment, and was never held open.
const SAME_MOMENT_SEC = 4

/// How long the teacher held thinking questions open — until they confirmed
/// an answer, gave it, or moved on — as Insights shows it: the median over
/// the questions the read counted as thinking ones, leaving out any set as
/// a task or answered by the teacher themselves,
/// with one still open at the window counted at the window. Null when no
/// thinking question was read, so a caller says "not measured".
export function heldOpenSummary(
  questionLog: QuestionLogEntry[] | null | undefined,
  selfAnswered: { timestampSec: number }[] = [],
): { typicalSec: number; long: number; questions: number } | null {
  const secs = (questionLog ?? [])
    .filter(
      (q) =>
        q.type === 'higher_order' &&
        (q.heldOpen?.outcome === 'closed' || q.heldOpen?.outcome === 'open') &&
        !selfAnswered.some((s) => Math.abs(s.timestampSec - q.timestampSec) <= SAME_MOMENT_SEC),
    )
    .map((q) => q.heldOpen!.sec ?? HELD_OPEN_WINDOW_SEC)
    .sort((a, b) => a - b)
  if (secs.length === 0) return null
  const mid = Math.floor(secs.length / 2)
  const median = secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2
  return { typicalSec: Math.round(median), long: secs.filter((s) => s >= LONG_PAUSE_SEC).length, questions: secs.length }
}
