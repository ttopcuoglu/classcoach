// What students said that the transcript gave to the teacher, found from the
// words and the run of the conversation rather than from how anyone sounded.
//
// Diarization folds students into the teacher: on many real lessons every
// line is one voice, so Student Talk read 0 and every student answer counted
// as the teacher's. Reading voices against each other was tried twice and
// failed (talk-time accuracy, 2026-10-27 and 10-31). The conversation carries
// what the audio does not: a short answer between a question and "Good,
// positive", an echo, a reply right after a student was named, a student's
// way of talking ("I think it's…", "I got 12", "I don't get it").
//
// It only moves words one way, from the teacher to a student, and only words
// the model points at and the transcript contains — so Student Talk can be
// smaller than the truth, never larger. Answers under three words stay with
// the teacher (the user's rule: short answers are not worth the guess).
// Silence and Group Talk never pass through here; they come from the sound.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { normalizeForMatch } from './lessonObjective.ts'

export const STUDENT_WORDS_VERSION = 1

/// Shorter than this stays the teacher's.
export const MIN_STUDENT_WORDS = 3

/// How far from the line it named the model's timestamp may be.
const NEAR_SEC = 20

const MAX_TRANSCRIPT_CHARS = 30000

/// Words a student said inside a line the transcript gave the teacher.
/// `text` is the transcript's own words; times are the line's, shared out by
/// word position.
export type StudentSpan = { lineStartSec: number; startSec: number; endSec: number; text: string }

function timestamp(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/// Both sides, so the model can read the exchange.
export function transcriptWithSpeakers(segments: Segment[]): string {
  const joined = segments
    .filter((s) => s.text.trim())
    .map((s) => `[${timestamp(s.startSec)}] ${s.speakerLabel === 'Teacher' ? 'TEACHER' : 'STUDENT'}: ${s.text.trim()}`)
    .join('\n')
  return joined.length <= MAX_TRANSCRIPT_CHARS ? joined : joined.slice(0, MAX_TRANSCRIPT_CHARS)
}

const SYSTEM_PROMPT = `You are reading a classroom transcript. Speaker detection was poor: many things STUDENTS said were written down as the TEACHER's, sometimes inside the same line as the teacher's question or reply. Find the words in TEACHER lines that a student actually said.

Use the conversation, not single sentences:
- An answer sitting between the teacher's question and the teacher's reaction is a student's: "What's the direction? It goes up and right. Good, up and right."
- The teacher echoing it back ("Negative, exactly") means the words before were a student's.
- A reply right after the teacher names a student ("Maya, what do you think?") is likely Maya's.
- Students' way of talking: answering, hedging ("is it…", "I think it's because…"), reporting results ("I got twelve"), asking for help or permission ("I don't get it", "can I go to the bathroom"), talking to each other.

These are the TEACHER's, never a student's:
- a question that the teacher then answers themselves while carrying on explaining;
- explaining, modelling or working an example aloud, even in a student-like voice ("so I'd take twelve and divide");
- directions, praise, feedback, revoicing ("so you're saying…"), reading the task aloud;
- a text being read aloud, unless it is plainly a student reading;
- describing what is on the board or screen: "A nice big coordinate plane." "You see an x.";
- running an activity or game: announcing turns, scores or what happens next ("Patrick passed. You wanna make your market a Target?");
- talking to the whole class with "you": "You see…", "You want to…", "You have two minutes";
- any question, including a fill-in-the-blank ("You see a what?", "and then go to what?") or one in the middle of an answer ("Positive. Why? Because it goes up."): list the student's words on each side of it separately, never the question;
- walking through steps with "we" ("so we went over to the number").

Only list words when the conversation makes it clear. When you are unsure, leave it out: missing a student is fine, giving the teacher's words to a student is not. Only words of three or more; skip one- and two-word answers. Copy the words EXACTLY as they appear in the TEACHER line, only the student's part, and give that line's timestamp. Lines already marked STUDENT are already counted: never list them.

Write nothing outside this tag. One per line, or NONE:
<student_words>
exact words @ m:ss
</student_words>`

const tokens = (text: string) => text.split(/\s+/).filter(Boolean)

/// The words [from, to) without any question among them, as the runs left
/// either side: [start, end) word indices. A question inside what was found
/// is almost always the teacher's — prompting for more ("Positive. Why?
/// Because it goes up.") or leaving a blank to fill ("You see a what?") —
/// so it stays theirs, every time, whatever the model said. A student's own
/// question goes to the teacher too: the safe direction (2026-11-02).
export function withoutQuestions(words: string[], from: number, to: number): [number, number][] {
  const cut = new Array<boolean>(to - from).fill(false)
  let sentence = from
  for (let i = from; i < to; i++) {
    if (!/[.!?]["”']?$/.test(words[i]) && i < to - 1) continue
    if (/\?["”']?$/.test(words[i])) for (let k = sentence; k <= i; k++) cut[k - from] = true
    sentence = i + 1
  }
  const runs: [number, number][] = []
  let start = -1
  for (let i = from; i <= to; i++) {
    const keep = i < to && !cut[i - from]
    if (keep && start === -1) start = i
    if (!keep && start !== -1) {
      runs.push([start, i])
      start = -1
    }
  }
  return runs
}

/// The model's lines to spans the transcript contains: each must lie inside
/// one teacher line near the time it gave, run three words or more once any
/// question is cut out, and not overlap another.
export function parseStudentWords(raw: string | null, segments: Segment[]): StudentSpan[] {
  if (!raw) return []
  const teacher = segments.filter((s) => s.speakerLabel === 'Teacher' && s.text.trim())
  const spans: StudentSpan[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim() || /^\s*NONE\s*$/i.test(line)) continue
    const m = line.match(/^(.*?)\s*@\s*(\d+):(\d{1,2})\s*$/)
    if (!m) continue
    const quote = tokens(normalizeForMatch(m[1].replace(/^[-•*\s]+/, '').replace(/^["“']|["”']$/g, '')))
    if (quote.length < MIN_STUDENT_WORDS) continue
    const claimed = Number(m[2]) * 60 + Number(m[3])
    const near = teacher
      .filter((s) => Math.abs(s.startSec - claimed) <= NEAR_SEC)
      .sort((a, b) => Math.abs(a.startSec - claimed) - Math.abs(b.startSec - claimed))
    for (const seg of near) {
      const raw = tokens(seg.text.trim())
      const norm = raw.map((w) => normalizeForMatch(w))
      let at = -1
      for (let i = 0; i + quote.length <= norm.length && at === -1; i++) {
        if (quote.every((w, k) => norm[i + k] === w)) at = i
      }
      if (at === -1) continue
      const dur = seg.endSec - seg.startSec
      // Sentences are read across the whole line, not just the words the
      // model picked: it can leave a question's last word off ("and then go
      // to" from "and then go to what?"), and the question is still a question.
      const runs = withoutQuestions(raw, 0, raw.length)
        .map(([a, b]): [number, number] => [Math.max(a, at), Math.min(b, at + quote.length)])
        .filter(([a, b]) => b > a)
      for (const [a, b] of runs) {
        if (b - a < MIN_STUDENT_WORDS) continue
        const span: StudentSpan = {
          lineStartSec: seg.startSec,
          startSec: seg.startSec + (a / raw.length) * dur,
          endSec: seg.startSec + (b / raw.length) * dur,
          text: raw.slice(a, b).join(' '),
        }
        if (!spans.some((s) => s.startSec < span.endSec && span.startSec < s.endSec)) spans.push(span)
      }
      break
    }
  }
  return spans.sort((a, b) => a.startSec - b.startSec)
}

type Quote = { quote?: unknown; text?: unknown }

/// A span another read of the lesson already quoted as the teacher's — a
/// question, a direction, an explanation — is the teacher's. The two reads
/// check each other.
export function dropTeacherQuotes(spans: StudentSpan[], teacherQuotes: unknown[]): StudentSpan[] {
  const said = teacherQuotes
    .map((q) => (q && typeof q === 'object' ? ((q as Quote).quote ?? (q as Quote).text) : null))
    .filter((t): t is string => typeof t === 'string')
    .map((t) => normalizeForMatch(t))
    .filter((t) => t.split(' ').length >= MIN_STUDENT_WORDS)
  return spans.filter((s) => {
    const words = normalizeForMatch(s.text)
    return !said.some((t) => t.includes(words) || words.includes(t))
  })
}

/// The transcript with each span cut out of its teacher line as a student's,
/// for who-spoke-when (the room trace). The stored transcript is never
/// changed: everything else keeps reading the lines as they were.
export function withStudentSpans<S extends Segment>(segments: S[], spans: StudentSpan[]): Segment[] {
  if (spans.length === 0) return segments
  const out: Segment[] = []
  for (const seg of segments) {
    const inside = seg.speakerLabel === 'Teacher' ? spans.filter((s) => Math.abs(s.lineStartSec - seg.startSec) < 0.01) : []
    if (inside.length === 0) {
      out.push(seg)
      continue
    }
    let from = seg.startSec
    for (const s of inside) {
      if (s.startSec > from) out.push({ ...seg, startSec: from, endSec: s.startSec })
      out.push({ ...seg, speakerLabel: 'Student', startSec: s.startSec, endSec: s.endSec, text: s.text })
      from = s.endSec
    }
    if (seg.endSec > from) out.push({ ...seg, startSec: from, endSec: seg.endSec })
  }
  return out
}

/// Best-effort like every model read here: null on failure, and the lesson
/// keeps the transcript's own split.
export async function readStudentWords(segments: Segment[]): Promise<StudentSpan[] | null> {
  const transcript = transcriptWithSpeakers(segments)
  if (transcript.length < 400) return []
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return parseStudentWords(extractTag(text, 'student_words'), segments)
  } catch (error) {
    console.error('[studentWords] read failed:', error)
    return null
  }
}

/// Everything the lesson's other reads quoted as the teacher's: the question
/// log and each teaching move.
export function teacherQuotesOf(teachingMoves: unknown, questionLog: unknown): unknown[] {
  const lists = teachingMoves && typeof teachingMoves === 'object' ? Object.values(teachingMoves as Record<string, unknown>) : []
  return [...lists, questionLog].flatMap((v) => (Array.isArray(v) ? v : []))
}
