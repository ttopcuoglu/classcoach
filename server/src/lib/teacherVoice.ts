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

/// How many questions had a pause of LONG_PAUSE_SEC or more before the
/// teacher spoke again, out of the questions where that pause could be timed.
///
/// Needs only the teacher's own voice: it runs from the end of the question
/// to the teacher's next line. It may contain a student's answer, so it is
/// never wait time or think time, and anything that says it must say so.
export function pauseAfterQuestions(questionLog: QuestionLogEntry[] | null | undefined): {
  long: number
  timed: number
} {
  const timed = (questionLog ?? []).filter((q) => typeof q.pauseSec === 'number')
  return { long: timed.filter((q) => (q.pauseSec as number) >= LONG_PAUSE_SEC).length, timed: timed.length }
}
