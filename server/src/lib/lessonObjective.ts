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

    // The one check that makes a quote trustworthy: it has to be in the
    // transcript. A model asked for an exact sentence mostly gives one, and
    // the times it doesn't are exactly the times a teacher would be told they
    // said something they never said.
    if (!normalizeForMatch(transcript).includes(normalizeForMatch(rawQuote))) {
      console.warn('[lessonObjective] discarded a quote that is not in the transcript')
      return { quote: null, timestampSec: null, summary }
    }

    return {
      quote: rawQuote,
      timestampSec: parseTimestamp(extractTag(text, 'objective_time')),
      summary,
    }
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
  // `found: null` means the recording was too short to have a start to check,
  // which no amount of reading will change.
  if (lessonContent.statedObjective.found === null) return lessonContent

  const read = await readLessonObjective(segments)
  if (!read.quote && !read.summary) return lessonContent

  return {
    ...lessonContent,
    summary: read.summary ?? lessonContent.summary ?? null,
    statedObjective: read.quote
      ? { found: true, quote: read.quote, timestampSec: read.timestampSec, source: 'model' }
      : // The model read the whole transcript and found none. That is a
        // stronger negative than the phrase detector's, so it wins.
        { found: false, quote: null, timestampSec: null, source: 'model' },
  }
}
