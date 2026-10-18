// How the teacher brought students in, in the teacher's own words.
//
// Three things, all of them the teacher's moves rather than the students'
// response, so all of them can be heard in the teacher's voice:
//   1. invitations to contribute, and the response format each offered
//      (hands up, turn and talk, write first…);
//   2. pushing students to explain and build on ideas — probing, asking for
//      reasoning, inviting a response to a classmate;
//   3. explicit attempts to reach beyond volunteers — shown only when the
//      recording has one, because none heard is not none done.
//
// Every quote is checked against the teacher's speech (lib/teachingMoves.ts
// readLines), and any name the teacher addressed someone by is replaced
// with "[name]": these are moments with a student in them, and a child's
// name does not belong in a report about someone else's teaching.

import { anthropic, CLAUDE_MODEL } from './anthropic.ts'
import { addressedNamesIn, NAME_MENTION_STOPWORDS, type Segment } from './audioAnalysis.ts'
import { extractTag } from './extractTag.ts'
import { flattenTeacherSpeech, transcriptForModel } from './lessonObjective.ts'
import { readLines, type Quoted } from './teachingMoves.ts'

export const INVITE_FORMATS = ['hands', 'call_out', 'turn_and_talk', 'write_first', 'show_me', 'choral', 'open'] as const
export const EXTEND_KINDS = ['probe', 'reasoning', 'build_on_peer'] as const

export type Participation = {
  invitations: (Quoted & { format: (typeof INVITE_FORMATS)[number] })[]
  extending: (Quoted & { kind: (typeof EXTEND_KINDS)[number] })[]
  widening: Quoted[]
}

const SYSTEM_PROMPT = `You are reading the teacher's side of a classroom recording. Find three kinds of moment in THEIR words. Copy the teacher's sentence EXACTLY as it appears, and give the timestamp of the line it came from.

INVITATIONS — the teacher explicitly opens the floor for students to contribute something substantive: an idea, an answer, a reading, their work. The invitation has to be in the words — "who wants to share…", "anyone have an idea?", "raise your hand if…", "turn and talk", "write it down, then we'll share", "who would like to read?". A plain content question to the room ("what are the two main allies?", "why do they tell sailors not to drink seawater?") is a QUESTION, not an invitation — leave it out. Also leave out logistics ("did you find those coefficients?", "do you want me to draw it?"), checks on understanding ("any questions?", "did anyone miss any of these?"), and fragments that are not a whole sentence. For each, say the response format it offered:
- hands — raise a hand to be called on ("hands up if you've got an idea")
- call_out — answer aloud, no hands ("just shout it out")
- turn_and_talk — talk to a partner or group first ("turn to your neighbor")
- write_first — write or jot before sharing ("write one sentence, then we'll share")
- show_me — everyone shows an answer (whiteboards, fingers, thumbs)
- choral — everyone says it together
- open — an invitation with no format named ("who wants to share?", "anyone?")

EXTENDING — the teacher pushes a student to explain or build on an idea:
- probe — asks a student to say more or go further on what they said ("say more about that", "what do you mean by…")
- reasoning — asks how they know or why ("what makes you think that?", "how did you get that?")
- build_on_peer — asks students to respond to a classmate ("who can add to that?", "do you agree with her?", "who sees it differently?")
A question that hands over the answer ("so it's the sun, right?") is NOT extending.

WIDENING — an explicit attempt to hear from students beyond the usual volunteers: "let's hear from someone who hasn't shared yet", "I'm going to call on this table", "I'll pick a name", "everyone talk with your partner, then I'll call on pairs", "not you this time — someone else". NOT a plain open question, and NOT calling on one student by name ("go ahead, Maya, start us off" is calling on one student, not widening).

Be exhaustive within each kind, to the end of the transcript. NONE is a real answer for any kind, and the right one for WIDENING in most lessons. A sentence goes in AT MOST ONE kind. Copy verbatim — a tidied quote is dropped. Ignore anything a student said. Do not count or conclude.

Write nothing outside these tags. One per line in the given shape, or NONE:
<invitations>
sentence @ m:ss | hands or call_out or turn_and_talk or write_first or show_me or choral or open
</invitations>
<extending>
sentence @ m:ss | probe or reasoning or build_on_peer
</extending>
<widening>
sentence @ m:ss
</widening>`

/// A name set off by commas the way direct address is — "So, Caleb, what…",
/// "…hook, Arabella, what should I see?", "Caleb, you…" — even where the
/// lesson-wide detector missed it. Capitalized, not a common opener.
const ADDRESSED_AFTER_COMMA = /(,\s*|\b(?:go ahead|thank you|thanks)\s+)(\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*)(?=\s*[,?!.])/gu
/// At the start of a sentence a name is followed by a comma ("Caleb, you…");
/// "Really?" and "Exactly." are not names.
const ADDRESSED_AT_START = /(^|[.!?]\s+)(\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*)(?=\s*,)/gu

/// Words that open a sentence before a comma and are not names.
const COMMON_OPENERS = new Set(['perfect', 'sure', 'awesome', 'correct', 'exactly', 'nice', 'wait', 'really', 'hmm', 'um', 'uh', 'wow', 'true', 'absolutely', 'definitely', 'maybe', 'sorry', 'please', 'thanks', 'and', 'but', 'or', 'like', 'because', 'if', 'when', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'right', 'everybody', 'everyone', 'guys', 'folks', 'class', 'friends'])

/// A name the teacher addressed someone by, anywhere in the quote, as
/// "[name]".
export function withoutNames(quote: string, names: string[]): string {
  const swap = (whole: string, lead: string, word: string) =>
    NAME_MENTION_STOPWORDS.has(word.toLowerCase().replace(/['’]/g, '')) || COMMON_OPENERS.has(word.toLowerCase())
      ? whole
      : `${lead}[name]`
  let out = quote.replace(ADDRESSED_AFTER_COMMA, swap).replace(ADDRESSED_AT_START, swap)
  for (const name of names) {
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), '[name]')
  }
  return out
}

export function parseParticipation(text: string, segments: Segment[]): Participation {
  const flat = flattenTeacherSpeech(segments)
  const names = addressedNamesIn(segments)
  const read = (tag: string) => readLines(extractTag(text, tag), flat).map((q) => ({ ...q, quote: withoutNames(q.quote, names) }))
  const pick = <T extends string>(attr: string, allowed: readonly T[], fallback: T): T =>
    allowed.find((a) => attr.replace(/[\s-]+/g, '_').includes(a)) ?? fallback
  return {
    invitations: read('invitations').map((q) => ({ quote: q.quote, timestampSec: q.timestampSec, format: pick(q.attr, INVITE_FORMATS, 'open') })),
    extending: read('extending').map((q) => ({ quote: q.quote, timestampSec: q.timestampSec, kind: pick(q.attr, EXTEND_KINDS, 'probe') })),
    widening: read('widening').map(({ quote, timestampSec }) => ({ quote, timestampSec })),
  }
}

/// Best-effort like the other reads: null on failure, and the report keeps
/// what it had.
export async function readParticipation(segments: Segment[]): Promise<Participation | null> {
  const transcript = transcriptForModel(segments)
  if (transcript.length < 400) return null
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    return parseParticipation(text, segments)
  } catch (error) {
    console.error('[participation] read failed:', error)
    return null
  }
}
