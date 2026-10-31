// Teacher Pause Time: how long the teacher left a question that asked
// students to explain or reason, from the end of the teacher's turn with the
// question in it to the moment the teacher spoke again. A student answering
// inside that time is part of it — this is the teacher's half, how long
// before they stepped back in.
//
// THE one place it is worked out. It used to be worked out three times — a
// held-silence figure here, the tile in the browser, a copy in the iPhone app
// — and on one lesson the server said 3.1 s, the tile 0.0 s, and the
// transcript about one second. Now it is worked out once, when the lesson is
// analysed, and stored; the web and the iPhone only show it, so a lesson
// reads the same right after class and a week later, and a code change
// cannot quietly move a number a teacher has already seen.
//
// It FAILS CLOSED. The measure needs to know where the teacher stopped
// talking, and on a room mic students' short answers are often transcribed
// as the teacher: "…would be, Bruce? Zero. Zero, very good." Read naively,
// that teacher talked straight past the question (0.0 s). Where answers
// like that turn up after too many of a lesson's questions, there is no
// number at all — "not measurable" is the honest answer, a confident wrong
// one is not.

import { countedQuestions } from './questionMix.ts'

/// Bumped whenever the arithmetic changes, so a stored figure says which
/// rules made it. A lesson keeps the figure it was analysed with; moving old
/// lessons onto new rules is a deliberate backfill, never a side effect.
export const TEACHER_PAUSE_VERSION = 1

/// Two teacher lines under this far apart are one turn still running.
const MAX_JOIN_GAP_SEC = 2
/// A gap over this is independent work or a hole in the recording.
const MAX_PAUSE_SEC = 30
/// More than this many words after the question, in the same turn, and the
/// teacher went on rather than leaving it with students.
const MAX_WORDS_AFTER = 3
/// A gap this long between two of the teacher's lines, straight after the
/// question, is a pause even though the turn carries on. Under it is a
/// breath between sentences: still talking past the question.
const MIN_PAUSE_IN_TURN_SEC = 1
/// The longest "sentence" straight after a question that reads as a student's
/// answer filed under the teacher: "Zero." "The x." "In quadrant three."
const MAX_ANSWER_WORDS = 3
/// At or above this share of a lesson's questions followed by an answer in
/// the teacher's lines, and at least MIN_FOLDED of them, the teacher's turns
/// cannot be trusted to end where the teacher stopped: no figure.
const MAX_FOLDED_SHARE = 0.25
const MIN_FOLDED = 2

/// Words a teacher says straight after their own question that are not an
/// answer: tags, fillers, praise.
const NOT_ANSWERS = new Set([
  'ok', 'okay', 'k', 'alright', 'all', 'right', 'so', 'now', 'well', 'um', 'uh', 'hmm', 'yes', 'yeah', 'no',
  'good', 'great', 'nice', 'perfect', 'excellent', 'awesome', 'very', 'thank', 'thanks', 'you', 'guys', 'and',
])

type Seg = { speakerLabel: string; startSec: number; endSec: number; text: string }

/// `answered`: a student was heard before the teacher spoke again.
/// `keptTalking`: the teacher went on with no real gap; `sec` is the gap
/// there was (0 when the question ran straight into more words in one line).
/// `folded`: what followed the question reads as a student's answer
/// transcribed as the teacher, so where the teacher stopped is unknown.
export type QuestionPause = {
  timestampSec: number
  text: string
  sec: number | null
  answered: boolean
  keptTalking?: true
  folded?: true
}

export type TeacherPauseReason = 'no_thinking_questions' | 'no_student_voice' | 'answers_in_teacher_voice' | 'none_timed'

export type TeacherPause = {
  version: number
  /// Average of the timed thinking questions, to a tenth; null with a reason.
  average: number | null
  reason: TeacherPauseReason | null
  /// How many questions in the lesson (all counted ones, not only thinking)
  /// were followed by an answer in the teacher's lines — the reading behind
  /// answers_in_teacher_voice, kept so it can be checked.
  foldedCount: number
  questionCount: number
  /// The thinking questions, in order, each with its pause.
  thinking: QuestionPause[]
}

type Token = { raw: string; w: string }

const tokensOf = (text: string): Token[] =>
  text
    .split(/\s+/)
    .map((raw) => ({ raw, w: raw.toLowerCase().replace(/[^a-z0-9']/g, '') }))
    .filter((t) => t.w)

const endsSentence = (raw: string) => /[.!?]["')\]]*$/.test(raw)
const endsQuestion = (raw: string) => /\?["')\]]*$/.test(raw)
/// "Bruce?" — a name the question was put to, not part of what follows it.
const isAddressedName = (sentence: Token[]) => sentence.length === 1 && /^\p{Lu}/u.test(sentence[0].raw) && endsQuestion(sentence[0].raw)

/// Whether the words straight after a question read as a student's answer:
/// a short sentence of their own, not another question, not a filler.
export function looksLikeAnswer(after: Token[]): boolean {
  let i = 0
  for (let pass = 0; pass < 2; pass++) {
    const sentence: Token[] = []
    while (i < after.length) {
      sentence.push(after[i])
      if (endsSentence(after[i++].raw)) break
    }
    if (sentence.length === 0) return false
    // A name the question was addressed to: look at what came after it.
    if (pass === 0 && isAddressedName(sentence)) continue
    const last = sentence[sentence.length - 1].raw
    return (
      sentence.length <= MAX_ANSWER_WORDS &&
      endsSentence(last) &&
      !endsQuestion(last) &&
      !sentence.every((t) => NOT_ANSWERS.has(t.w))
    )
  }
  return false
}

/// The pause after one question, or null where it cannot be timed.
function pauseAfter(ordered: Seg[], t: number, quote: string): Omit<QuestionPause, 'timestampSec' | 'text'> | null {
  const idx = ordered.findIndex((s) => s.endSec > t)
  if (idx === -1 || ordered[idx].speakerLabel !== 'Teacher') return null
  let end = idx
  while (
    end + 1 < ordered.length &&
    ordered[end + 1].speakerLabel === 'Teacher' &&
    ordered[end + 1].startSec - ordered[end].endSec <= MAX_JOIN_GAP_SEC
  ) {
    end++
  }
  // Where the question ends in the turn: just after the last place its final
  // three words appear.
  const lineTokens = ordered.slice(idx, end + 1).map((s) => tokensOf(s.text))
  const turn = lineTokens.flat()
  const tail = tokensOf(quote).slice(-3).map((x) => x.w).join(' ')
  let at = -1
  for (let i = 0; i + 3 <= turn.length; i++) if (turn.slice(i, i + 3).map((x) => x.w).join(' ') === tail) at = i + 3
  if (at !== -1 && looksLikeAnswer(turn.slice(at))) return { sec: null, answered: true, folded: true }
  if (at !== -1 && turn.length - at > MAX_WORDS_AFTER) {
    // The line the question ends in, and how many words it still had.
    let k = 0
    let upTo = lineTokens[0].length
    while (upTo < at && k < lineTokens.length - 1) upTo += lineTokens[++k].length
    if (upTo - at > MAX_WORDS_AFTER || k === lineTokens.length - 1) return { sec: 0, answered: false, keptTalking: true }
    const gap = Math.round((ordered[idx + k + 1].startSec - ordered[idx + k].endSec) * 10) / 10
    if (gap < MIN_PAUSE_IN_TURN_SEC) return { sec: Math.max(0, gap), answered: false, keptTalking: true }
    return { sec: gap, answered: false }
  }
  const rest = ordered.slice(end + 1)
  const nextTeacher = rest.find((x) => x.speakerLabel === 'Teacher')
  if (!nextTeacher) return null
  const gap = nextTeacher.startSec - ordered[end].endSec
  if (gap < 0 || gap > MAX_PAUSE_SEC) return null
  const answered = rest.some((x) => x.speakerLabel !== 'Teacher' && x.startSec < nextTeacher.startSec)
  return { sec: Math.round(gap * 10) / 10, answered }
}

export function teacherPauseOf(segments: Seg[], questionLog: unknown, teachingMoves: unknown): TeacherPause {
  const ordered = segments.filter((s) => s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  const { questions } = countedQuestions(questionLog, teachingMoves)
  const all = questions.map((q) => ({ q, p: pauseAfter(ordered, q.timestampSec, q.text) }))
  const thinking: QuestionPause[] = all
    .filter(({ q }) => q.mix !== 'recall')
    .map(({ q, p }) => ({ timestampSec: q.timestampSec, text: q.text, ...(p ?? { sec: null, answered: false }) }))
  const foldedCount = all.filter(({ p }) => p?.folded).length
  const base = { version: TEACHER_PAUSE_VERSION, foldedCount, questionCount: questions.length, thinking }

  const studentHeard = ordered.some((s) => s.speakerLabel !== 'Teacher')
  const reason: TeacherPauseReason | null =
    thinking.length === 0
      ? 'no_thinking_questions'
      : !studentHeard
        ? 'no_student_voice'
        : foldedCount >= MIN_FOLDED && foldedCount >= questions.length * MAX_FOLDED_SHARE
          ? 'answers_in_teacher_voice'
          : null
  if (reason) return { ...base, average: null, reason }
  const timed = thinking.filter((p) => p.sec != null).map((p) => p.sec as number)
  if (timed.length === 0) return { ...base, average: null, reason: 'none_timed' }
  return { ...base, average: Math.round((timed.reduce((a, b) => a + b, 0) / timed.length) * 10) / 10, reason: null }
}

/// The stored average from a lesson's metricsDetail: a number, null where it
/// was not measurable, or undefined for a lesson analysed before it was
/// stored — the only case where a figure the app sends is used instead.
export function storedTeacherPause(metricsDetail: unknown): number | null | undefined {
  const pause = (metricsDetail as { teacherPause?: { average?: unknown } } | null)?.teacherPause
  if (pause == null || typeof pause !== 'object') return undefined
  return typeof pause.average === 'number' ? pause.average : null
}
