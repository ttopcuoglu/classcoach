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

function transcriptForModel(segments: Segment[]): string {
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

Write nothing outside these tags:
<objective>the exact sentence, or ${NONE}</objective>
<objective_time>m:ss of that line, or ${NONE}</objective_time>
<summary>one or two sentences, or ${NONE}</summary>`

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
function normalizeForMatch(text: string): string {
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
function flattenTeacherSpeech(segments: Segment[]): { flat: string; offsets: { at: number; startSec: number }[] } {
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

function startSecAtOffset(offsets: { at: number; startSec: number }[], offset: number): number | null {
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

export type ObjectiveFromModel = {
  quote: string | null
  timestampSec: number | null
  summary: string | null
}

/// Best-effort. Any failure returns nulls and the caller keeps the phrase
/// detector's answer — a report that loses one line is fine, a transcription
/// that fails because of this is not.
export async function readLessonObjective(segments: Segment[]): Promise<ObjectiveFromModel> {
  const empty: ObjectiveFromModel = { quote: null, timestampSec: null, summary: null }
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

    if (!rawQuote || rawQuote.toUpperCase().includes(NONE)) {
      return { quote: null, timestampSec: null, summary }
    }

    const claimedTime = parseTimestamp(extractTag(text, 'objective_time'))

    // The check that makes a quote trustworthy: the teacher has to have said
    // these words, in this order. Against the flattened speech, so a sentence
    // spoken across three segments still counts as having been said.
    const { flat, offsets } = flattenTeacherSpeech(segments)
    const offset = flat.indexOf(normalizeForMatch(rawQuote))
    if (offset !== -1) {
      return { quote: rawQuote, timestampSec: startSecAtOffset(offsets, offset) ?? claimedTime, summary }
    }

    // Not verbatim. Take the words from the segment the model pointed at
    // rather than from the model.
    const recovered = quoteFromSegment(segments, claimedTime, rawQuote)
    if (recovered) {
      return { quote: recovered.quote, timestampSec: recovered.timestampSec, summary }
    }

    console.warn('[lessonObjective] discarded a quote that is in neither the transcript nor the segment it cited')
    return { quote: null, timestampSec: null, summary }
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
  if (!read.quote && !read.summary) return lessonContent

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
    statedObjective: read.quote
      ? { found: true, quote: read.quote, timestampSec: read.timestampSec, source: 'model' }
      : foundNothing,
  }
}
