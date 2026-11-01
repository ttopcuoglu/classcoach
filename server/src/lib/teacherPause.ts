// Teacher Pause Time: how long the teacher left a question that asked
// students to explain or reason, from the end of the question to the
// teacher's next real sentence — four words or more, or a new question. A
// student answering inside that time is part of it, and so is a one-word
// answer or echo ("Zero. Zero.") whoever said it: this is the teacher's
// half, how long before they moved the lesson on.
//
// THE one place it is worked out. It used to be worked out three times — a
// held-silence figure here, the tile in the browser, a copy in the iPhone app
// — and on one lesson the server said 3.1 s, the tile 0.0 s, and the
// transcript about one second. Now it is worked out once, when the lesson is
// analysed, and stored; the web and the iPhone only show it, so a lesson
// reads the same right after class and a week later, and a code change
// cannot quietly move a number a teacher has already seen.
//
// Why "real sentence": on a room mic, students' short answers are often
// transcribed as the teacher — "…would be, Bruce? Zero. Zero. Because let's
// say…". Timed to the teacher's next words, that read as 0.0 s; timed to
// the next real sentence it reads as the second or so it was, without ever
// having to decide who said "Zero". With no student voice told apart at all
// there is still no figure: a longer answer would read as the teacher.

import { countedQuestions } from './questionMix.ts'

/// Bumped whenever the arithmetic changes, so a stored figure says which
/// rules made it. A lesson keeps the figure it was analysed with; moving old
/// lessons onto new rules is a deliberate backfill, never a side effect.
export const TEACHER_PAUSE_VERSION = 2

/// Two teacher lines under this far apart are one turn still running.
const MAX_JOIN_GAP_SEC = 2
/// A gap over this is independent work or a hole in the recording.
const MAX_PAUSE_SEC = 30
/// Under this, the teacher went straight on: a breath between sentences,
/// still talking past the question.
const MIN_PAUSE_IN_TURN_SEC = 1
/// What ends the pause: the teacher building a real sentence again — this
/// many words, or a question of QUESTION_WORDS. Anything shorter ("Zero."
/// "Four." "Very good." "Zero, zero.") does not stop the clock, whoever said
/// it: a student's one-word answer and the teacher echoing it are both still
/// inside the time the teacher left before moving the lesson on. That is what
/// makes the measure work on a room mic, where those short answers are
/// transcribed as the teacher — it never has to know who said them.
const SENTENCE_WORDS = 4
const QUESTION_WORDS = 3
/// The longest "sentence" straight after a question that reads as a student's
/// answer filed under the teacher: "Zero." "The x." "In quadrant three."
const MAX_ANSWER_WORDS = 3

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
/// transcribed as the teacher. It is inside the pause, which is timed to the
/// teacher's next real sentence; counted because the other pause measures,
/// which do need to know who spoke, fail on it (pauseGates.ts).
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

type TimedToken = Token & { seg: number; startSec: number; endSec: number }

/// A line's words, each given a time by its place in the line. The transcript
/// times lines, not words; a line is split where the speaker paused, so the
/// words inside one run close together and their place is a fair estimate.
function timedTokens(seg: Seg, segIndex: number): TimedToken[] {
  const tokens = tokensOf(seg.text)
  const step = tokens.length > 0 ? (seg.endSec - seg.startSec) / tokens.length : 0
  return tokens.map((t, i) => ({ ...t, seg: segIndex, startSec: seg.startSec + i * step, endSec: seg.startSec + (i + 1) * step }))
}

/// A sentence that ends the pause: the teacher moving the lesson on.
const isRealSentence = (sentence: Token[]) =>
  sentence.length >= SENTENCE_WORDS || (sentence.length >= QUESTION_WORDS && endsQuestion(sentence[sentence.length - 1].raw))

/// The pause after one question, or null where it cannot be timed: from the
/// end of the question to the start of the teacher's next real sentence.
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
  // three words appear. Not found, the whole turn is taken as the question.
  const turn = ordered.slice(idx, end + 1).flatMap((s, k) => timedTokens(s, idx + k))
  const tail = tokensOf(quote).slice(-3).map((x) => x.w).join(' ')
  let at = -1
  for (let i = 0; i + 3 <= turn.length; i++) if (turn.slice(i, i + 3).map((x) => x.w).join(' ') === tail) at = i + 3
  if (at === -1) at = turn.length
  if (at === 0) return null
  const askedEnd = turn[at - 1].endSec
  const folded = looksLikeAnswer(turn.slice(at))

  // Walk on through the teacher's words, sentence by sentence, until one is
  // real. A sentence carries over into the next teacher line only within one
  // turn; a longer gap, or a student between, ends it.
  let answered = false
  let shortPieces = false
  let sentence: TimedToken[] = []
  let lastSeg = -1
  const flush = () => {
    if (sentence.length > 0 && !isRealSentence(sentence)) shortPieces = true
    sentence = []
  }
  // The rest of the turn, then every line up to the ceiling; a student line
  // is one marker with no words.
  const pending = [...turn.slice(at)]
  for (let k = end + 1; k < ordered.length && ordered[k].startSec - askedEnd <= MAX_PAUSE_SEC; k++) {
    if (ordered[k].speakerLabel === 'Teacher') pending.push(...timedTokens(ordered[k], k))
    else pending.push({ raw: '', w: '', seg: k, startSec: ordered[k].startSec, endSec: ordered[k].endSec })
  }
  for (const tok of pending) {
    if (tok.startSec - askedEnd > MAX_PAUSE_SEC) return null
    if (!tok.w) {
      // A student line.
      flush()
      answered = true
      lastSeg = -1
      continue
    }
    // Once a student was heard on their own line, the teacher's next words
    // are the teacher stepping back in, however short: "Not completely." The
    // short-words rule is only for answers the transcript did NOT separate.
    if (answered && sentence.length === 0) {
      return { sec: Math.max(0, Math.round((tok.startSec - askedEnd) * 10) / 10), answered: true, ...(folded ? { folded: true } : {}) }
    }
    if (lastSeg !== -1 && tok.seg !== lastSeg && ordered[tok.seg].startSec - ordered[lastSeg].endSec > MAX_JOIN_GAP_SEC) flush()
    lastSeg = tok.seg
    sentence.push(tok)
    // Four words in, it is a real sentence whether or not it has ended; a
    // short question needs its question mark.
    if (!endsSentence(tok.raw) && sentence.length < SENTENCE_WORDS) continue
    if (isRealSentence(sentence)) {
      const gap = Math.max(0, Math.round((sentence[0].startSec - askedEnd) * 10) / 10)
      const anything = answered || shortPieces
      if (!anything && gap < MIN_PAUSE_IN_TURN_SEC) return { sec: gap, answered: false, keptTalking: true, ...(folded ? { folded: true } : {}) }
      return { sec: gap, answered, ...(folded ? { folded: true } : {}) }
    }
    flush()
  }
  return null
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
  // Answers in the teacher's lines no longer stop this measure: the pause
  // runs to the teacher's next real sentence, short answers and echoes
  // inside it. It still needs some student voice told apart, or a longer
  // answer would read as the teacher moving on.
  const reason: TeacherPauseReason | null =
    thinking.length === 0 ? 'no_thinking_questions' : !studentHeard ? 'no_student_voice' : null
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
