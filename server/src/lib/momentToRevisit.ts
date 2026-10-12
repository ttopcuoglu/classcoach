// The one moment in a lesson most worth a second look, found by reading it.
//
// The card this feeds used to be chosen by a fixed ranking of counts, and the
// top of that ranking was "longest uninterrupted teacher monologue". Every
// recording has a longest stretch, so it won by default. Read against six real
// lessons it was the right call once. The stretches it reported spanned a
// video, a Chromebook hand-out, and four students reading aloud whom the
// microphone never caught — "uninterrupted" only ever meant "no student
// segment was transcribed in between". One lesson's headline was a 59-second
// "monologue".
//
// What those lessons actually had to work on was none of the things a count
// can see: a question the teacher answered themselves, a check that was the
// word "Agreed?", directions restarted five times, a student's confusion met
// with a muddled explanation and a change of subject. Each of those is a
// moment with words in it, so this asks the model to find the moment and then
// takes the words from the transcript rather than from the model.
//
// Three things it must be able to say instead of naming a moment, because a
// card that always has something to say is how the old one went wrong:
//   - not enough of the lesson was captured to choose honestly
//   - this recording is not a lesson at all (one in the test set was a
//     dissertation defense, reported as a 920-second monologue)
//   - nothing here stands out as worth revisiting

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { CORE_COACHING_RULES, TRANSCRIPT_RELIABILITY_NOTICE } from './coachPersona.ts'
import { extractTag } from './extractTag.ts'

export type MomentStatus = 'found' | 'thin' | 'not_a_lesson' | 'clear'

export type MomentToRevisit = {
  generatedAt: string
  status: MomentStatus
  /// What happened, in one sentence addressed to the teacher. Null unless found.
  headline: string | null
  /// The words from the transcript at that moment — never the model's.
  quote: string | null
  timestampSec: number | null
  whyItMatters: string | null
  /// One move small enough to try in the next lesson.
  tryNext: string | null
}

/// A 60-minute class at a brisk pace. Past this the lesson loses its end
/// rather than failing the read.
const MAX_TRANSCRIPT_CHARS = 60000

/// Below this there is not a lesson's worth of words to choose a moment from.
const MIN_TRANSCRIPT_CHARS = 1500

const MAX_QUOTE_CHARS = 200

function timestamp(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function parseTimestamp(value: string | null): number | null {
  const match = value?.match(/(\d+):(\d{1,2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function transcriptForMoment(segments: Segment[]): string {
  const lines = [...segments]
    .sort((a, b) => a.startSec - b.startSec)
    .filter((s) => s.text.trim())
    .map((s) => `[${timestamp(s.startSec)}] ${s.speakerLabel === 'Teacher' ? 'T' : 'S'}: ${s.text.trim()}`)
  const joined = lines.join('\n')
  return joined.length <= MAX_TRANSCRIPT_CHARS ? joined : joined.slice(0, MAX_TRANSCRIPT_CHARS)
}

const SYSTEM_PROMPT = `You are an experienced instructional coach reading the transcript of a classroom recording. Your job is to find the ONE moment in this lesson most worth the teacher's second look — the weakest point they could actually do something about next lesson — or to say honestly that you cannot.
${CORE_COACHING_RULES}
${TRANSCRIPT_RELIABILITY_NOTICE}

HOW TO READ THIS TRANSCRIPT. Each line is [m:ss] T: or S:, and both parts are unreliable.
- The speaker labels are guesses. Student answers are often marked T, and a video's narration or another adult is often marked S. Decide who is speaking from what is said, not from the letter.
- A jump in the timestamps is time when nothing was transcribed: students working, a video playing, voices too far from the microphone. It is not silence and it is not the teacher talking.
- Distant voices come out garbled or not at all. A question followed by nothing may have been answered by a student the microphone missed.

WHAT COUNTS AS A MOMENT WORTH REVISITING. A specific point in the lesson, with words in it, where a different move by the teacher would plausibly have changed what students did or understood. The kinds that turn up most:
- The teacher asked a real question and then answered it themselves, or took one short answer and did the rest of the thinking.
- A check for understanding that could not have told the teacher anything — "Agreed?", "Questions? Cool.", "Right?" — at a point where understanding mattered.
- Directions that had to be restarted, were contradicted, or were given while students were busy with something else, followed by signs that students did not know what to do.
- A student's confusion or wrong idea that was left unresolved, or met with an explanation that did not address it.
- A long stretch of explanation in which students were given nothing to do with the content.
- Time that went to a digression while the lesson waited.
- A behaviour moment that escalated, or took the lesson over.
These are examples, not a checklist. Choose what THIS lesson shows.

WHAT DOES NOT COUNT.
- A pattern with no moment: "you talked a lot" is not a moment. Point to where.
- Anything that rests only on a gap in the transcript or on a speaker label.
- How long the teacher spoke, measured by you. You cannot measure it.
- Something small chosen because you felt you had to choose. If the lesson's weakest point is minor, say so in the "why" rather than inflating it.

CHOOSING. Prefer the moment that cost students the most learning over the one that is easiest to quote. Prefer one the teacher can change with a single move next lesson over one that would need a different lesson. If two are close, take the one with the clearer evidence.

THE THREE OTHER ANSWERS, each a real answer and not a failure:
- THIN: too little of what was SAID came through to choose honestly — mostly fragments, or long gaps with a few stray lines between them. This is about the transcript, not the lesson plan: a recording that stops when students start working on their own is not thin, and neither is one where the teacher did most of the talking. If there are several minutes of continuous, readable teaching, there is enough to choose from.
- NOT_A_LESSON: this is not a class being taught — a presentation to adults, a meeting, a recording of something else.
- CLEAR: the lesson is captured well enough to judge and nothing in it stands out as worth revisiting.

WRITING IT. You are speaking to the teacher as a colleague who was in the room.
- headline: one plain sentence saying what happened, in the second person and the past tense, under 30 words. No judgement words and no loaded verbs — "you gave the answer", not "you shut it down". "You asked what overgrazing is, waited, and then answered it yourself."
- quote: the teacher's own words at that moment, copied EXACTLY from the transcript, with the timestamp of the line they are on. The shortest stretch that shows the moment — one sentence, and a two-word check like "Questions? Cool." is a complete quote. Only words that are clearly the teacher's and clearly transcribed: leave out a student's reply, and leave out anything garbled. It will be checked against the transcript and discarded if it is not there.
- why: what it cost students, tied to this lesson's content. One or two short sentences, 40 words at most. Not a general principle.
- try: ONE concrete thing to do at that same point next time, specific enough to picture — the words to say or the task to set. 40 words at most. Not "consider", not a list.
Speak to the teacher as "you" throughout, never as "the teacher". Call any student "a student" and refer to them as "they": never a name, and never "he" or "she", which a transcript cannot tell you.

Write nothing outside these tags:
<status>FOUND, THIN, NOT_A_LESSON or CLEAR</status>
<headline>one sentence, or NONE</headline>
<quote_time>m:ss, or NONE</quote_time>
<quote>the exact words, or NONE</quote>
<why>one or two sentences, or NONE</why>
<try>one concrete move, or NONE</try>`

const STATUSES: Record<string, MomentStatus> = {
  FOUND: 'found',
  THIN: 'thin',
  NOT_A_LESSON: 'not_a_lesson',
  CLEAR: 'clear',
}

function field(text: string, tag: string): string | null {
  const value = extractTag(text, tag)?.trim()
  return !value || /^NONE\.?$/i.test(value) ? null : value
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= MAX_QUOTE_CHARS) return clean
  const cut = clean.slice(0, MAX_QUOTE_CHARS)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : MAX_QUOTE_CHARS)}…`
}

/// The transcript's own words for the moment the model pointed at.
///
/// Verbatim first: the quote found anywhere in the lesson, whoever it was
/// labelled as, since the labels are the unreliable part. Failing that, the
/// model has usually tidied a real sentence — so take the line near the time
/// it cited that shares most of its words. Enough overlap to recognise a
/// tidied sentence, not enough to let an invented one through by landing near
/// a timestamp. Null means nobody said it, and the moment is dropped.
export function quoteFromTranscript(
  segments: Segment[],
  claimed: string,
  claimedSec: number | null,
): { quote: string; timestampSec: number } | null {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec).filter((s) => s.text.trim())
  const target = normalize(claimed)
  // "Agreed?" is a whole quote and exactly the kind worth showing, so one
  // word is allowed — but it has to be a word, not a stray letter.
  if (target.length < 4) return null

  let flat = ' '
  const offsets: { at: number; startSec: number }[] = []
  for (const s of ordered) {
    const piece = normalize(s.text)
    if (!piece) continue
    offsets.push({ at: flat.length, startSec: s.startSec })
    flat += `${piece} `
  }
  const startSecAt = (at: number) => {
    let startSec = offsets[0]?.startSec ?? 0
    for (const o of offsets) {
      if (o.at <= at) startSec = o.startSec
      else break
    }
    return startSec
  }
  // Whole words, so "cool" is not found inside "school". A short check is
  // said many times in a lesson, so of every place it appears the one nearest
  // the time the model cited is the one it meant.
  const needle = ` ${target} `
  let found: number | null = null
  for (let at = flat.indexOf(needle); at !== -1; at = flat.indexOf(needle, at + 1)) {
    const startSec = startSecAt(at + 1)
    if (found == null || (claimedSec != null && Math.abs(startSec - claimedSec) < Math.abs(found - claimedSec))) {
      found = startSec
    }
    if (claimedSec == null) break
  }
  if (found != null) return { quote: clip(claimed), timestampSec: found }

  if (claimedSec == null) return null
  const claimedWords = target.split(' ').filter((w) => w.length > 3)
  if (claimedWords.length < 3) return null
  let best: { segment: Segment; overlap: number } | null = null
  for (const s of ordered) {
    if (Math.abs(s.startSec - claimedSec) > 25) continue
    const words = new Set(normalize(s.text).split(' '))
    const overlap = claimedWords.filter((w) => words.has(w)).length / claimedWords.length
    if (!best || overlap > best.overlap) best = { segment: s, overlap }
  }
  if (!best || best.overlap < 0.6) return null
  return { quote: clip(best.segment.text), timestampSec: best.segment.startSec }
}

/// Turns the model's reply into what is stored. Exported for tests: the rules
/// about what gets dropped are the part worth pinning down.
export function parseMoment(text: string, segments: Segment[], now = new Date()): MomentToRevisit | null {
  const status = STATUSES[(extractTag(text, 'status') ?? '').trim().toUpperCase()]
  if (!status) return null
  const empty = { headline: null, quote: null, timestampSec: null, whyItMatters: null, tryNext: null }
  const generatedAt = now.toISOString()
  if (status !== 'found') return { generatedAt, status, ...empty }

  const headline = field(text, 'headline')
  const claimed = field(text, 'quote')
  const whyItMatters = field(text, 'why')
  const tryNext = field(text, 'try')
  // A moment with no words from the lesson behind it is an opinion, and the
  // card's whole claim is that it is not one. Null rather than 'clear': this
  // is a read that failed, not a lesson with nothing to revisit, so it is not
  // stored and the next view tries again.
  if (!headline || !claimed || !whyItMatters || !tryNext) return null
  const quoted = quoteFromTranscript(segments, claimed, parseTimestamp(extractTag(text, 'quote_time')))
  if (!quoted) return null
  return { generatedAt, status, headline, quote: quoted.quote, timestampSec: quoted.timestampSec, whyItMatters, tryNext }
}

/// Best-effort. Null means the read did not happen or did not hold up, and the
/// caller stores nothing — the report simply has no card until a later try.
export async function readMomentToRevisit(segments: Segment[]): Promise<MomentToRevisit | null> {
  const transcript = transcriptForMoment(segments)
  // Decided here rather than by the model: there is nothing to read.
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return {
      generatedAt: new Date().toISOString(),
      status: 'thin',
      headline: null,
      quote: null,
      timestampSec: null,
      whyItMatters: null,
      tryNext: null,
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      // Adaptive thinking draws on the same budget; left on, a short reply
      // can come back with no text blocks at all.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const moment = parseMoment(text, segments)
    if (!moment) console.warn('[momentToRevisit] discarded a reply with no usable moment')
    return moment
  } catch (error) {
    console.error('[momentToRevisit] failed:', error)
    return null
  }
}
