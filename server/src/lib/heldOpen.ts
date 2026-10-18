import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { QuestionLogEntry, Segment } from './audioAnalysis.ts'
import { doubtfulWords, keepConfident } from './deepgram.ts'
import { extractTag } from './extractTag.ts'
import { normalizeForMatch } from './lessonObjective.ts'

// How long each thinking question was held open.
//
// The pause that matters after a thinking question is not the gap before the
// teacher's next word — a student's answer sits inside that — but how long
// the question stays open for the room: until the teacher confirms an answer,
// gives it, or moves on. "Anyone else?", "say more about that" and a neutral
// "mm-hm" keep it open. That is the part the teacher controls, and it needs
// only the teacher's own speech.
//
// A separate read, given the lesson's existing higher-order questions, rather
// than folded into the read that finds them: re-running that one on an old
// lesson re-detects every question and moves counts a teacher has already
// seen. This one classifies a fixed list, so it changes nothing else.
//
// The model never picks the closing line. It marks each of the teacher's
// lines after the question as keeping it open or closing it, and the code
// takes the first that closes — so a model that skips past an early close
// (a first dry run scored 111s on a question the teacher moved on from at
// 45s) cannot. The lines are numbered here, so the time comes from the
// transcript, not from matching the model's quote.

/// Past this, the lesson has moved on whether or not anything closed it.
export const HELD_OPEN_WINDOW_SEC = 120

/// The kinds of question this measure counts — the teacher's own list.
/// Anything else (recall, a yes/no, a procedural or tag question) is left
/// out of this measure, though it keeps its higher-order label elsewhere.
export const THINKING_TYPES = ['explain', 'justify', 'compare', 'evaluate', 'predict', 'opinion'] as const
export type ThinkingType = (typeof THINKING_TYPES)[number]

export type HeldOpen = {
  /// closed: the teacher confirmed, gave the answer, or moved on.
  /// open: nothing closed it inside the window.
  /// task: it was set as work ("ten minutes to answer these") — not a
  ///   question held open for the room, so not in the typical time.
  /// self_answered: the teacher answered it in the same line they asked it.
  /// not_thinking: not one of THINKING_TYPES.
  outcome: 'closed' | 'open' | 'task' | 'self_answered' | 'not_thinking'
  questionType: ThinkingType | null
  /// Seconds from the end of the question to the close (or to the task).
  sec: number | null
  /// The closing phrase, as the teacher said it. Null when the phrase could
  /// not be found word for word in that line — the time still stands, since
  /// it comes from the line.
  closedBy: string | null
  closedAtSec: number | null
  how: 'confirmed' | 'gave_answer' | 'moved_on' | null
}

/// One of the teacher's lines after a question, or the rest of the line the
/// question was asked in (L0).
type WindowLine = { n: number; text: string; startSec: number; endSec: number }

type Prepared = {
  n: number
  /// Index in the question log.
  i: number
  text: string
  startSec: number
  endSec: number
  lines: WindowLine[]
  /// Other voices, for context only.
  others: number[]
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/// Where `phrase` sits in `text`, as a fraction of the way through it, or
/// null. Compared normalized, so punctuation and case do not matter.
function fractionOf(phrase: string, text: string): { from: number; to: number } | null {
  const p = normalizeForMatch(phrase)
  const t = normalizeForMatch(text)
  if (!p || !t) return null
  const at = t.indexOf(p)
  if (at === -1) return null
  return { from: at / t.length, to: (at + p.length) / t.length }
}

/// The teacher's speech as one normalized string, with each line's span in
/// it, so a question that runs across two of the teacher's lines can still be
/// found, and where it ends placed inside the line it ends in.
function teacherFlat(teacher: Segment[]) {
  const spans: { at: number; end: number; seg: Segment; norm: string }[] = []
  let flat = ''
  for (const seg of teacher) {
    const norm = normalizeForMatch(seg.text)
    if (!norm) continue
    if (flat) flat += ' '
    spans.push({ at: flat.length, end: flat.length + norm.length, seg, norm })
    flat += norm
  }
  return { flat, spans }
}

/// Each higher-order question placed in the transcript, with the teacher's
/// lines that follow it inside the window. A question that cannot be found
/// in the teacher's speech is left out — it cannot be timed.
export function prepareQuestions(questionLog: QuestionLogEntry[], segments: Segment[]): Prepared[] {
  const spoken = segments.filter((s) => s.text.trim())
  const teacher = spoken.filter((s) => s.speakerLabel === 'Teacher')
  const t = teacherFlat(teacher)
  const out: Prepared[] = []
  questionLog.forEach((entry, i) => {
    if (entry.type !== 'higher_order') return
    const needle = normalizeForMatch(entry.text)
    if (!needle) return
    // Every place the words occur; the one starting nearest the logged time.
    let best: { at: number; gap: number } | null = null
    for (let at = t.flat.indexOf(needle); at !== -1; at = t.flat.indexOf(needle, at + 1)) {
      const span = t.spans.find((s) => s.end > at)!
      const gap = Math.abs(span.seg.startSec - entry.timestampSec)
      if (!best || gap < best.gap) best = { at, gap }
    }
    if (!best || best.gap > 15) return
    const endAt = best.at + needle.length
    const startSpan = t.spans.find((s) => s.end > best!.at)!
    const endSpan = t.spans.find((s) => s.end >= endAt)!
    const home = endSpan.seg
    const fraction = Math.min(1, Math.max(0, (endAt - endSpan.at) / Math.max(1, endSpan.norm.length)))
    const endSec = home.startSec + (home.endSec - home.startSec) * fraction
    const lines: WindowLine[] = []
    // What the teacher said after the question in the same line: where a
    // same-breath answer shows up.
    // Words Deepgram doubts are the teacher's are left out here and below:
    // a student folded into the teacher's line must not read as the teacher
    // answering or closing the question.
    const words = home.text.trim().split(/\s+/)
    const homeDoubt = doubtfulWords(home.text, home.speakerConfidence)
    const tailFrom = Math.round(words.length * fraction)
    const tail = keepConfident(words.slice(tailFrom), homeDoubt?.slice(tailFrom) ?? null).trim()
    if (normalizeForMatch(tail).split(' ').filter(Boolean).length >= 2) {
      lines.push({ n: 0, text: tail, startSec: endSec, endSec: home.endSec })
    }
    let n = 1
    const doubted: number[] = []
    for (const s of teacher) {
      if (s.startSec < home.endSec - 0.01 || s === home) continue
      if (s.startSec > endSec + HELD_OPEN_WINDOW_SEC) break
      const text = keepConfident(s.text.trim().split(/\s+/), doubtfulWords(s.text, s.speakerConfidence))
      // A line Deepgram doubts entirely is someone else speaking.
      if (!text) doubted.push(s.startSec)
      else lines.push({ n: n++, text, startSec: s.startSec, endSec: s.endSec })
    }
    const others = [
      ...spoken
        .filter((s) => s.speakerLabel !== 'Teacher' && s.startSec >= endSec - 0.01 && s.startSec <= endSec + HELD_OPEN_WINDOW_SEC)
        .map((s) => s.startSec),
      ...doubted,
    ]
    out.push({ n: out.length + 1, i, text: entry.text, startSec: startSpan.seg.startSec, endSec, lines, others })
  })
  return out
}

const SYSTEM_PROMPT = `You are reading short stretches of a classroom recording. Each starts with a question the teacher asked (Q), followed by the teacher's numbered lines (L) and marks where someone else spoke. L0, when present, is what the teacher said right after the question in the same breath. "…" inside a line marks words left out because they may be someone else's.

For each question, do two things.

1. TYPE. Say which kind of question it is, or SKIP:
- explain — asks why or how something happens or works
- justify — asks for reasons or evidence for an answer or a choice
- compare — asks how things are alike or different, or which is better
- evaluate — asks for a judgement: good or bad, an advantage or disadvantage, whether something is right
- predict — asks what will happen, what if, or to apply an idea to a new case
- opinion — an open question about the student's own view or experience, with no single right answer
- SKIP — anything else: recalling a fact, name, term or definition ("what is a transitional phrase?", "what happened?"), a yes/no question, "what's another one?", a procedural or tag question. When in doubt, SKIP.
If SKIP, write nothing more for that question.

2. LINES. Go through the teacher's lines in order and mark each one, stopping at the first line that is "close" or "task":
- open — ONLY these keep the question open for the room: inviting more answers ("anyone else?", "who sees it differently?"), asking a student to say more, explain or back it up, neutral acknowledgement that judges nothing ("mm-hm", "okay", "hmm"), repeating a student's answer with no judgement, giving time to think ("take a second"), or a brief word to manage behaviour.
- close — anything else ends it. The teacher confirms or judges an answer ("yes", "exactly", "right", "good", "not quite") — including a "yes" right after repeating a student's answer, and anywhere inside a longer line; starts explaining the answer or the idea themselves, even partly; or moves on — a different question, a direction, a transition ("alright, kiddos", "okay, next"), or new content. Moving on counts even if no one answered. A line where the teacher is explaining is a close, not open.
- task — the question was set as work to do: written, in groups, or for a set time ("I'm gonna give you ten minutes to answer these").

For a close, say how (confirmed, gave_answer or moved_on) and copy the few words that close it, under 12 words, EXACTLY as written in that line.
If no line closes it, mark them all open.

Write nothing outside this tag:
<held>
Q1 | explain
L0 | open
L1 | open
L2 | close | confirmed | yes, exactly
Q2 | SKIP
Q3 | evaluate
L1 | task | I'm gonna give you ten minutes
</held>`

/// The stretches the read sees.
export function heldOpenPrompt(questions: Prepared[]): string {
  return questions
    .map((q) => {
      const rows = [
        ...q.lines.map((l) => ({ at: l.startSec, text: `  L${l.n} [${mmss(l.startSec)}] ${l.text}` })),
        ...q.others.map((at) => ({ at, text: `  [${mmss(at)}] (someone else speaks)` })),
      ].sort((a, b) => a.at - b.at)
      return [`Q${q.n} [${mmss(q.startSec)}] ${q.text}`, ...rows.map((r) => r.text)].join('\n')
    })
    .join('\n\n')
}

/// The read's answer, as one HeldOpen per question it covered. A question it
/// said nothing about is absent, and stays unmeasured.
export function parseHeldOpen(text: string, questions: Prepared[]): Map<number, HeldOpen> {
  const out = new Map<number, HeldOpen>()
  const body = extractTag(text, 'held')
  if (!body) return out

  // Group the lines under their question.
  const blocks = new Map<number, { type: string; marks: string[] }>()
  let current: { type: string; marks: string[] } | null = null
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const q = line.match(/^Q(\d+)\s*\|\s*(\w+)/i)
    if (q) {
      current = { type: q[2].toLowerCase(), marks: [] }
      if (!blocks.has(Number(q[1]))) blocks.set(Number(q[1]), current)
      else current = null
      continue
    }
    if (current && /^L\d+\s*\|/i.test(line)) current.marks.push(line)
  }

  for (const q of questions) {
    const block = blocks.get(q.n)
    if (!block) continue
    const base = { sec: null, closedBy: null, closedAtSec: null, how: null }
    const questionType = (THINKING_TYPES as readonly string[]).includes(block.type) ? (block.type as ThinkingType) : null
    if (!questionType) {
      out.set(q.n, { outcome: 'not_thinking', questionType: null, ...base })
      continue
    }
    // The first line marked close or task, in the teacher's order — whatever
    // order the model wrote them in.
    const marked = block.marks
      .map((m) => {
        const parts = m.split('|').map((p) => p.trim())
        const n = Number(parts[0].replace(/^L/i, ''))
        return { n, mark: (parts[1] ?? '').toLowerCase(), rest: parts.slice(2) }
      })
      .filter((m) => q.lines.some((l) => l.n === m.n) && (m.mark === 'close' || m.mark === 'task'))
      .sort((a, b) => a.n - b.n)
    const first = marked[0]
    if (!first) {
      out.set(q.n, { outcome: 'open', questionType, ...base })
      continue
    }
    const line = q.lines.find((l) => l.n === first.n)!
    const how =
      first.mark === 'task'
        ? null
        : ((['confirmed', 'gave_answer', 'moved_on'] as const).find((h) => (first.rest[0] ?? '').toLowerCase().includes(h)) ??
          'moved_on')
    const phrase = (first.mark === 'task' ? first.rest.join('|') : first.rest.slice(1).join('|'))
      .trim()
      .replace(/^["“]|["”]$/g, '')
    const where = phrase ? fractionOf(phrase, line.text) : null
    const closedAtSec = line.startSec + (line.endSec - line.startSec) * (where?.from ?? 0)
    const sec = Math.max(0, Math.round((closedAtSec - q.endSec) * 10) / 10)
    if (sec > HELD_OPEN_WINDOW_SEC) {
      out.set(q.n, { outcome: 'open', questionType, ...base })
      continue
    }
    // Answered in the same breath it was asked: never open to the room.
    if (line.n === 0 && how === 'gave_answer') {
      out.set(q.n, { outcome: 'self_answered', questionType, ...base })
      continue
    }
    out.set(q.n, {
      outcome: first.mark === 'task' ? 'task' : 'closed',
      questionType,
      sec,
      closedBy: where ? phrase : null,
      closedAtSec: Math.round(closedAtSec * 10) / 10,
      how,
    })
  }
  return out
}

/// The question log with `heldOpen` on every higher-order question the read
/// covered. Recall questions are left as they are. Null when the read failed,
/// so a caller keeps what it had.
export async function readHeldOpen(questionLog: QuestionLogEntry[], segments: Segment[]): Promise<QuestionLogEntry[] | null> {
  const questions = prepareQuestions(questionLog, segments)
  if (questions.length === 0) return questionLog
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 6000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: heldOpenPrompt(questions) }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const held = parseHeldOpen(text, questions)
    return questionLog.map((entry, i) => {
      const q = questions.find((x) => x.i === i)
      const h = q ? held.get(q.n) : undefined
      return h ? { ...entry, heldOpen: h } : entry
    })
  } catch (error) {
    console.error('[heldOpen] read failed:', error)
    return null
  }
}
