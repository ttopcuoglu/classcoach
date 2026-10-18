// What the teacher's own language did, read from the transcript with the
// evidence attached.
//
// Seven things the report could not say before, all of them about the
// TEACHER's speech. That is the whole reason they are answerable: the
// microphone sits with the teacher, so their words are the one thing it
// reliably has. Every measure here is a quote with a timestamp, because a
// count of "clear directions" told a teacher nothing they could act on and a
// quote tells them exactly what they said.
//
// Deliberately NOT folded into classroomMoves. That prompt already feeds the
// question counts, the tone log, the feedback split and the redirection log,
// and adding seven more categories to it risks moving numbers that are
// already in front of teachers. This runs alongside and owns nothing else.
//
// What this does that the existing reads do not: it appraises the teacher's
// language rather than counting it. That cuts against the rule we set when we
// stopped appraising student talk — and it is defensible only here, for the
// same reason those were dropped. We stopped judging students because the mic
// hears them badly. It hears the teacher well.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import type { Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import {
  flattenTeacherSpeech,
  normalizeForMatch,
  startSecAtOffset,
  transcriptForModel,
} from './lessonObjective.ts'
import { quoteOrNull } from './quoteSafety.ts'

/// Per category. High enough that a real lesson is never silently truncated
/// to "the cap", which is what made thinkingTaskCount meaningless.
const MAX_PER_KIND = 20

/// Below this a quote is a fragment, not a sentence a teacher can recognise
/// as theirs.
const MIN_QUOTE_CHARS = 12

export type Quoted = { quote: string; timestampSec: number }

/// A question the teacher asked and then answered themselves.
///
/// Today these are DISCARDED: classroomMoves' prompt excludes "a question the
/// teacher answers themselves in the same breath" from the question count, so
/// the one move most worth noticing leaves no trace at all.
export type SelfAnswered = Quoted

/// What answering would have required of a student. Finer than the
/// recall/higher-order split, and additive: it labels examples for the
/// report to show, and never touches the counts classroomMoves produces.
export type QuestionKind = 'recall' | 'explain' | 'justify' | 'compare' | 'evaluate'

/// The four things a direction can carry. A direction naming all four leaves
/// nothing to guess at; one naming none is "off you go".
export type DirectionPart = 'task' | 'steps' | 'time' | 'product'

export type ExplanationKind = 'example' | 'analogy' | 'vocabulary' | 'modeling'

/// Whether an audible redirection told the student what to DO. "Stop that"
/// and "Eyes on me, pencils down" are both redirections; only one of them is
/// actionable.
export type RedirectionClarity = 'actionable' | 'vague'

export type ConnectionKind = 'prior' | 'purpose' | 'closing'

export type TeachingMoves = {
  selfAnswered: SelfAnswered[]
  questionKinds: (Quoted & { kind: QuestionKind })[]
  directions: (Quoted & { parts: DirectionPart[] })[]
  explanations: (Quoted & { kind: ExplanationKind })[]
  revisionPrompts: Quoted[]
  invitations: Quoted[]
  redirections: (Quoted & { clarity: RedirectionClarity })[]
  connections: (Quoted & { kind: ConnectionKind })[]
}

export const EMPTY_MOVES: TeachingMoves = {
  selfAnswered: [],
  questionKinds: [],
  directions: [],
  explanations: [],
  revisionPrompts: [],
  invitations: [],
  redirections: [],
  connections: [],
}

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording. Find eight kinds of moment in THEIR words. Copy the teacher's sentence EXACTLY as it appears, and give the timestamp of the line it came from.

SELF-ANSWERED QUESTIONS — the teacher asks something and answers it themselves without a student speaking: "So why did wages rise? Because there were fewer workers." List the question and its answer together as one sentence, the way they said it. This is not a fault; it is a move worth seeing.

QUESTION KINDS — for questions the teacher LEFT with students, what answering would have required. A question ASKS FOR AN ANSWER and leaves it with the student. These are NOT questions, whatever their punctuation:
- an imperative — "circle one of the reasons", "write down three causes" — that is a DIRECTION;
- a request to do a task, however politely phrased — "does anybody want to read this out?" — also a DIRECTION, and an INVITATION if it opens the floor;
- a discourse marker the teacher talks straight through — "right?", "okay?", "you know?".
For the real ones, what answering would have required:
- recall — a fact, name, number, definition, or step the class already has.
- explain — saying how or why something works, in their own words.
- justify — giving a reason for a claim or a choice, backing it with evidence.
- compare — setting two things against each other.
- evaluate — judging, weighing a trade-off, or deciding which is better.

DIRECTIONS — telling students what to do with the work. ONE STRETCH OF INSTRUCTION IS ONE DIRECTION, however many sentences it runs to: "I'll give you five minutes. Read the passage, then answer the two questions, and hand the sheet in" is a single direction, listed once from the sentence that starts it. Judge the whole stretch together — splitting it would report a teacher as naming only the time when they also named the task.

For each, say which of these four it names: task (what to do), steps (in what order), time (how long), product (what to hand in or produce). List only the ones actually named, or "none".

EXPLANATION MOVES — how the content was opened up:
- example — a concrete instance of an idea.
- analogy — a comparison to something outside the subject ("wax on, wax off").
- vocabulary — giving the meaning of a term, however informally.
- modeling — the teacher thinking aloud through their own reasoning: "so the first thing I'd ask myself is...".

REVISION PROMPTS — responses to a student that invite them to go further or try again: "say more about that", "what would change if...", "can you back that up?". NOT praise, and not a new question to the room; this is pushing on something a student just said.

INVITATIONS TO PARTICIPATE — language opening the floor: "who can build on that?", "take a moment to think", "turn and talk", "hands up if you've got an idea". Record the INVITATION only. Never say whether anyone took it up — this recording cannot show that.

REDIRECTIONS — bringing attention or behaviour back. For each, say whether it is actionable (names what to DO: "eyes up front, pencils down") or vague (names only what to stop, or nothing: "hey", "stop that").

CONNECTIONS — prior (tying to earlier learning: "remember last week's slopes"), purpose (why this matters or where it is going), closing (drawing the lesson together at the end).

Be exhaustive within each kind, not representative. A lesson with eight directions in it comes back with eight, not the two clearest; a lesson with five analogies comes back with five. Work through the transcript to the end rather than stopping once a category has something in it. Most lessons have far more of these than a first pass notices.

Rules that matter more than finding things:
- Copy sentences verbatim. A sentence the teacher did not say is dropped, and a tidied-up quote is a dropped quote.
- A sentence appears in AT MOST ONE category across the whole reply. If it could be two, choose the one it most plainly is — an invitation to read aloud is an invitation, not also a question.
- NONE is a real answer for any kind, and is the right answer for most lessons in several of them. Never stretch a sentence to fill a category.
- Ignore anything a student said. You are reading the teacher only.
- Do not count, rank, or draw a conclusion. List the moments; something else decides what they mean.

Write nothing outside these tags. One per line in the given shape, or NONE:
<self_answered>
sentence @ m:ss
</self_answered>
<question_kinds>
sentence @ m:ss | recall or explain or justify or compare or evaluate
</question_kinds>
<directions>
sentence @ m:ss | comma-separated from task, steps, time, product — or none
</directions>
<explanations>
sentence @ m:ss | example or analogy or vocabulary or modeling
</explanations>
<revision_prompts>
sentence @ m:ss
</revision_prompts>
<invitations>
sentence @ m:ss
</invitations>
<redirections>
sentence @ m:ss | actionable or vague
</redirections>
<connections>
sentence @ m:ss | prior or purpose or closing
</connections>`

export type Flat = { flat: string; offsets: { at: number; startSec: number }[] }

/// One line to a verified quote plus whatever followed the pipe.
///
/// The transcript decides whether it was said — the same rule as every other
/// model read here. A quote the teacher's own speech does not contain is
/// dropped rather than shown, however plausible it reads.
export function readLines(raw: string | null, { flat, offsets }: Flat): (Quoted & { attr: string })[] {
  if (!raw) return []
  const out: (Quoted & { attr: string })[] = []
  const seen = new Set<string>()
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    // A LINE that is only NONE means the category is empty. Matching NONE
    // anywhere in the body — which is what this used to do — threw away every
    // direction in a lesson as soon as one of them named none of the four
    // parts, since "none" is a legitimate attribute here.
    if (/^\s*NONE\s*$/i.test(line)) continue
    const [head, ...tail] = line.split('|')
    const match = head.match(/^(.*?)(?:\s*@\s*(\d+):(\d{1,2}))?\s*$/)
    if (!match) continue
    const quote = match[1].trim().replace(/^[-•*\d.)\s]+/, '').replace(/^["']|["']$/g, '')
    if (quote.length < MIN_QUOTE_CHARS) continue
    const offset = flat.indexOf(normalizeForMatch(quote))
    if (offset === -1) continue
    const claimed = match[2] ? Number(match[2]) * 60 + Number(match[3]) : 0
    const timestampSec = startSecAtOffset(offsets, offset) ?? claimed
    // The same sentence listed twice in one category is one moment.
    const key = `${Math.round(timestampSec)}|${normalizeForMatch(quote).slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ quote, timestampSec, attr: tail.join('|').trim().toLowerCase() })
    if (out.length >= MAX_PER_KIND) break
  }
  return out.sort((a, b) => a.timestampSec - b.timestampSec)
}

function pick<T extends string>(attr: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => attr.includes(a)) ?? fallback
}

export function parseTeachingMoves(text: string, segments: Segment[]): TeachingMoves {
  const flat = flattenTeacherSpeech(segments)
  const read = (tag: string) => readLines(extractTag(text, tag), flat)
  const plain = (tag: string): Quoted[] => read(tag).map(({ quote, timestampSec }) => ({ quote, timestampSec }))

  return {
    selfAnswered: plain('self_answered'),
    questionKinds: read('question_kinds').map((q) => ({
      quote: q.quote,
      timestampSec: q.timestampSec,
      kind: pick(q.attr, ['explain', 'justify', 'compare', 'evaluate', 'recall'] as const, 'recall'),
    })),
    directions: read('directions').map((d) => ({
      quote: d.quote,
      timestampSec: d.timestampSec,
      // Only what was actually named. An empty list is the finding: a
      // direction that names none of the four is "off you go".
      parts: (['task', 'steps', 'time', 'product'] as const).filter((part) => d.attr.includes(part)),
    })),
    explanations: read('explanations').map((e) => ({
      quote: e.quote,
      timestampSec: e.timestampSec,
      kind: pick(e.attr, ['analogy', 'vocabulary', 'modeling', 'example'] as const, 'example'),
    })),
    revisionPrompts: plain('revision_prompts'),
    invitations: plain('invitations'),
    redirections: read('redirections')
      // Withheld rather than shown when the wording cannot be trusted: this
      // category judges how a teacher spoke to a child, and a mangled quote
      // there is an accusation built on a mis-transcription.
      .filter((r) => quoteOrNull(r.quote) != null)
      .map((r) => ({
        quote: r.quote,
        timestampSec: r.timestampSec,
        clarity: pick(r.attr, ['actionable', 'vague'] as const, 'vague'),
      })),
    connections: read('connections').map((c) => ({
      quote: c.quote,
      timestampSec: c.timestampSec,
      kind: pick(c.attr, ['prior', 'purpose', 'closing'] as const, 'prior'),
    })),
  }
}

export function countMoves(moves: TeachingMoves): number {
  return (
    moves.selfAnswered.length +
    moves.questionKinds.length +
    moves.directions.length +
    moves.explanations.length +
    moves.revisionPrompts.length +
    moves.invitations.length +
    moves.redirections.length +
    moves.connections.length
  )
}

/// Best-effort, like every other model read in the analysis path: a failure
/// returns null and the report says nothing rather than guessing.
export async function readTeachingMoves(segments: Segment[]): Promise<TeachingMoves | null> {
  const transcript = transcriptForModel(segments)
  if (transcript.length < 400) return null

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      // Adaptive thinking draws from this budget and can return a reply with
      // no text blocks at all — see lessonObjective's note.
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const moves = parseTeachingMoves(text, segments)
    return countMoves(moves) > 0 ? moves : null
  } catch (error) {
    console.error('[teachingMoves] read failed:', error)
    return null
  }
}
