// What the lesson said it was about — read from the transcript by Claude
// rather than matched against a phrase list.
//
// The phrase detector in `audioAnalysis.ts` looks for eleven fixed openers
// ("today we're going to", "learning target") inside the first five minutes.
// That encodes how an objective gets written on a board, not how it gets said
// out loud, and it stops looking before the do-now is over — so a teacher who
// reviews for ten minutes and then says "so we're picking up with cell
// division" comes back with nothing, under a heading that promised them their
// own words. This reads the whole transcript and quotes what is actually there.
//
// Two separate things come back, and keeping them separate is the point:
//   - the objective, which is a QUOTE and is often genuinely absent
//   - the summary, which describes what the lesson covered and always exists
// A lesson with no stated objective still had a topic, and a teacher who never
// said one out loud deserves to be told that plainly rather than handed a
// sentence invented for them.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { LessonContentResult, Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'

/// Enough of a lesson to know what it was about. A 35-minute class runs well
/// under this; the cap exists so an unusually long recording degrades by
/// losing its end rather than failing.
const MAX_TRANSCRIPT_CHARS = 24000

const NONE = 'NONE'

function timestamp(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function transcriptForModel(segments: Segment[]): string {
  const lines = segments
    .filter((s) => s.speakerLabel === 'Teacher')
    .map((s) => `[${timestamp(s.startSec)}] ${s.text.trim()}`)
    .filter((line) => line.length > 0)
  const joined = lines.join('\n')
  return joined.length <= MAX_TRANSCRIPT_CHARS ? joined : joined.slice(0, MAX_TRANSCRIPT_CHARS)
}

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording's transcript. Two jobs, and they are independent of each other.

1. THE STATED OBJECTIVE. Find the moment, if there is one, where the teacher tells students what they are going to learn or be able to do. It does not have to be at the start, it does not have to use the word "objective", and it does not have to be phrased formally — "so today we're figuring out why the leaves change colour" counts.

Reply with the teacher's own sentence, copied EXACTLY as it appears in the transcript, and the timestamp of the line it came from.

Most lessons do not contain one. A teacher who starts working without announcing a goal, or who posted it on the board instead of saying it, has not stated one out loud, and the honest answer is ${NONE}. Do not stretch a topic sentence, a task direction ("take out your notebooks and start question one"), or a review question into an objective. Never write a sentence the teacher did not say.

2. THE SUMMARY. One or two plain sentences saying what this lesson actually covered — the content, not the teaching. "Photosynthesis, focusing on the role of chlorophyll and a lab on leaf pigments." Not "the teacher led a discussion and asked questions." If the transcript is too fragmentary to tell, say ${NONE} here too.

3. REAL-WORLD AND PRIOR-KNOWLEDGE CONNECTIONS. Up to two moments where the teacher tied the content to something outside the lesson — everyday life, a job, a story, something the class did before. It does not have to announce itself: "that's going to be important in cooking because you want things to taste the same" is a cooking connection, and "remember what we did with slopes last week" is a prior-knowledge one. Copy the teacher's sentence EXACTLY and give the timestamp of its line.

4. THE SUBJECT. The subject area this lesson belongs to, as a teacher would say it: "science", "math", "English language arts", "US history", "Spanish", "art". Three words at most. ${NONE} if the transcript genuinely doesn't make it clear.

5. DEFINED VOCABULARY. Up to two moments where the teacher gave the meaning of a term, however informally — "equivalent just means they're worth the same", "we call that the numerator". Again, exact sentences and timestamps.

For 3 and 5, ${NONE} is a real answer. Plenty of lessons contain neither, and inventing one is worse than reporting none.

Write nothing outside these tags:
<objective>the exact sentence, or ${NONE}</objective>
<objective_time>m:ss of that line, or ${NONE}</objective_time>
<summary>one or two sentences, or ${NONE}</summary>
<subject>the subject area, or ${NONE}</subject>
<connections>
one exact sentence per line, each followed by " @ m:ss", or ${NONE}
</connections>
<vocabulary>
one exact sentence per line, each followed by " @ m:ss", or ${NONE}
</vocabulary>`

function parseTimestamp(value: string | null): number | null {
  if (!value) return null
  const match = value.match(/(\d+):(\d{1,2})/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/// Loose containment: the model may normalise whitespace or drop a trailing
/// comma, and rejecting a real quote over that would be worse than accepting
/// a lightly reformatted one. What this catches is the case that matters — a
/// sentence the teacher never said at all.
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function words(text: string): string[] {
  return normalizeForMatch(text).split(' ').filter((w) => w.length > 3)
}

/// The teacher's speech as one continuous string, plus where each segment
/// starts in it.
///
/// Deepgram splits on pauses, not sentences, so one spoken sentence routinely
/// arrives as two or three segments — "Alright." / "So" / "we are going to
/// make a list as a class now." Checking a quote against the timestamped
/// transcript therefore fails for any sentence that crosses a boundary, which
/// is most of them. Flattening first is what makes the check mean "did the
/// teacher say this", rather than "did one segment happen to contain it".
export function flattenTeacherSpeech(segments: Segment[]): { flat: string; offsets: { at: number; startSec: number }[] } {
  const offsets: { at: number; startSec: number }[] = []
  let flat = ''
  for (const segment of segments) {
    if (segment.speakerLabel !== 'Teacher') continue
    const piece = normalizeForMatch(segment.text)
    if (!piece) continue
    if (flat) flat += ' '
    offsets.push({ at: flat.length, startSec: segment.startSec })
    flat += piece
  }
  return { flat, offsets }
}

export function startSecAtOffset(offsets: { at: number; startSec: number }[], offset: number): number | null {
  let found: number | null = null
  for (const o of offsets) {
    if (o.at <= offset) found = o.startSec
    else break
  }
  return found
}

/// The model is good at finding the moment and unreliable at transcribing it:
/// asked for an exact sentence it will tidy the grammar, merge two lines, or
/// drop a filler. Rejecting those outright turned a real objective into "not
/// said aloud", which is a worse lie than the paraphrase was.
///
/// So the model locates and the transcript quotes. The segment it pointed at
/// supplies the words, and it only counts if most of what the model claimed to
/// be quoting is actually in that segment — enough to catch a tidied sentence,
/// not enough to let an invented one through by landing near a timestamp.
function quoteFromSegment(
  segments: Segment[],
  timestampSec: number | null,
  claimed: string,
): { quote: string; timestampSec: number } | null {
  if (timestampSec == null) return null
  const teacherSegments = segments.filter((s) => s.speakerLabel === 'Teacher')
  if (teacherSegments.length === 0) return null

  // A window rather than one segment, because a sentence is usually spread
  // over several of them.
  const window = teacherSegments.filter((s) => Math.abs(s.startSec - timestampSec) <= 20)
  if (window.length === 0) return null

  const claimedWords = words(claimed)
  if (claimedWords.length < 4) return null
  const windowWords = new Set(window.flatMap((s) => words(s.text)))
  const overlap = claimedWords.filter((w) => windowWords.has(w)).length / claimedWords.length
  if (overlap < 0.6) return null

  return {
    quote: window.map((s) => s.text.trim()).join(' ').replace(/\s+/g, ' ').trim(),
    timestampSec: window[0].startSec,
  }
}

export type Quoted = { quote: string; timestampSec: number }

export type ObjectiveFromModel = {
  quote: string | null
  timestampSec: number | null
  summary: string | null
  /// What subject this lesson belongs to, in the teacher's words ("science",
  /// "algebra"). Null when the transcript doesn't make it clear.
  subject: string | null
  connections: Quoted[]
  vocabulary: Quoted[]
}

/// Each line is "the teacher's sentence @ m:ss". Verified the same way the
/// objective is — against the teacher's speech flattened into one string — so
/// a sentence nobody said is dropped rather than shown to a teacher as theirs.
export function parseQuotedLines(
  raw: string | null,
  flat: string,
  offsets: { at: number; startSec: number }[],
  max: number,
): Quoted[] {
  if (!raw || raw.toUpperCase().includes(NONE)) return []
  const out: Quoted[] = []
  for (const line of raw.split('\n')) {
    // The "@ m:ss" is optional. Requiring it threw away real moments by the
    // handful whenever the model left it off — one lesson's directions came
    // back 0, 4, 0, 7 across four runs purely on whether it remembered the
    // suffix. Where the quote sits in the teacher's own speech is the better
    // timestamp anyway; the model's is only the fallback.
    const match = line.match(/^(.*?)(?:\s*@\s*(\d+:\d{1,2}))?\s*$/)
    if (!match) continue
    const quote = match[1].trim().replace(/^[-•*\d.\s]+/, '').replace(/^["']|["']$/g, '')
    if (quote.length < 12) continue
    const offset = flat.indexOf(normalizeForMatch(quote))
    if (offset === -1) continue
    out.push({ quote, timestampSec: startSecAtOffset(offsets, offset) ?? parseTimestamp(match[2] ?? null) ?? 0 })
    if (out.length === max) break
  }
  return out
}

/// A subject is a label, used in a heading and in "a supportive X content-area
/// specialist". Anything long, punctuated, or sentence-like is the model
/// answering a different question, and is dropped rather than shown.
function parseSubject(raw: string | null): string | null {
  if (!raw) return null
  const value = raw.trim().replace(/[.]+$/, '')
  if (!value || value.toUpperCase().includes(NONE)) return null
  if (!/^[A-Za-z][A-Za-z '-]{1,28}$/.test(value)) return null
  if (value.split(/\s+/).length > 3) return null
  return value.toLowerCase()
}

/// Best-effort. Any failure returns nulls and the caller keeps the phrase
/// detector's answer — a report that loses one line is fine, a transcription
/// that fails because of this is not.
export async function readLessonObjective(segments: Segment[]): Promise<ObjectiveFromModel> {
  const empty: ObjectiveFromModel = { quote: null, timestampSec: null, summary: null, subject: null, connections: [], vocabulary: [] }
  const transcript = transcriptForModel(segments)
  if (transcript.length < 200) return empty

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      // This model defaults to adaptive extended thinking drawn from the same
      // budget; left on, a 500-token reply can come back with no text blocks.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const rawQuote = extractTag(text, 'objective')
    const rawSummary = extractTag(text, 'summary')
    const summary = !rawSummary || rawSummary.toUpperCase().includes(NONE) ? null : rawSummary
    const subject = parseSubject(extractTag(text, 'subject'))

    const { flat, offsets } = flattenTeacherSpeech(segments)
    const connections = parseQuotedLines(extractTag(text, 'connections'), flat, offsets, 2)
    const vocabulary = parseQuotedLines(extractTag(text, 'vocabulary'), flat, offsets, 2)

    if (!rawQuote || rawQuote.toUpperCase().includes(NONE)) {
      return { quote: null, timestampSec: null, summary, subject, connections, vocabulary }
    }

    const claimedTime = parseTimestamp(extractTag(text, 'objective_time'))

    // The check that makes a quote trustworthy: the teacher has to have said
    // these words, in this order. Against the flattened speech, so a sentence
    // spoken across three segments still counts as having been said.
    const offset = flat.indexOf(normalizeForMatch(rawQuote))
    if (offset !== -1) {
      return {
        quote: rawQuote,
        timestampSec: startSecAtOffset(offsets, offset) ?? claimedTime,
        summary,
        subject,
        connections,
        vocabulary,
      }
    }

    // Not verbatim. Take the words from the segment the model pointed at
    // rather than from the model.
    const recovered = quoteFromSegment(segments, claimedTime, rawQuote)
    if (recovered) {
      return { ...recovered, summary, subject, connections, vocabulary }
    }

    console.warn('[lessonObjective] discarded a quote that is in neither the transcript nor the segment it cited')
    return { quote: null, timestampSec: null, summary, subject, connections, vocabulary }
  } catch (error) {
    console.error('[lessonObjective] failed:', error)
    return empty
  }
}

/// Merges the model's reading into the phrase detector's result. The phrase
/// detector stays as the fallback: it costs nothing, it never invents, and it
/// is what the report falls back to when the model call fails.
export async function enrichLessonContent(
  lessonContent: LessonContentResult,
  segments: Segment[],
): Promise<LessonContentResult> {
  const read = await readLessonObjective(segments)
  if (!read.quote && !read.summary && !read.subject && read.connections.length === 0 && read.vocabulary.length === 0) {
    return lessonContent
  }

  // `found: null` is the phrase detector saying the recording was too short to
  // have an opening to scan. That floor belonged to a scan that needed a
  // phase; reading the transcript does not, and a twenty-four second clip that
  // opens "today we are going to look at how plants make their own food"
  // plainly did state one. So a quote overrides it — but its absence does not,
  // because "nobody said one in twenty seconds" is not a finding about the
  // lesson, and the teacher keeps the honest "start not captured".
  const foundNothing = lessonContent.statedObjective.found === null
    ? { found: null, quote: null, timestampSec: null, source: 'model' as const }
    : { found: false, quote: null, timestampSec: null, source: 'model' as const }

  return {
    ...lessonContent,
    summary: read.summary ?? lessonContent.summary ?? null,
    // The keyword scan knows ~45 words: a lesson on moon phases matched none
    // of them, came back with no subject, and that silently withheld Content
    // Specialist Notes from a teacher whose transcript says "moon phases"
    // eight times. The model reads what the lesson was actually about.
    subject: read.subject ?? lessonContent.subject,
    // The phrase scan looked for ten fixed openers — "in real life", "remember
    // when we" — and missed a teacher tying ratios to cooking because she
    // simply talked about cooking. What the model finds wins; what it finds
    // nothing of falls back, since the scan never invents.
    connections: read.connections.length > 0 ? read.connections : lessonContent.connections,
    vocabulary: read.vocabulary.length > 0 ? read.vocabulary : lessonContent.vocabulary,
    statedObjective: read.quote
      ? { found: true, quote: read.quote, timestampSec: read.timestampSec, source: 'model' }
      : foundNothing,
  }
}
