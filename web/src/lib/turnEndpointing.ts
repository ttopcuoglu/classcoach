// How long to wait in silence before deciding a teacher has finished their
// turn. This used to be a flat 1400ms regardless of what they had just said,
// which gets both ends wrong: it makes someone who has been talking for
// fifteen seconds wait out the same pause as someone who has said two words
// and is obviously still assembling the thought.
//
// The rule is that how long someone has just been speaking predicts what a
// pause means. A long, flowing answer that stops has usually finished. A
// three-word fragment that stops is usually mid-thought — "The thing is..."
// — and cutting that off is the worst failure this feature has, far worse
// than a few hundred milliseconds of delay. So the window is shortened after
// long speech and lengthened after short speech, and the lengthening is
// deliberately the bigger move of the two.
//
// The whole curve came down by about 500ms in October 2026, as half of a
// pair of changes. On its own that would have been the wrong trade — these
// waits were set deliberately high, and cutting a thinking teacher off is
// the worst failure this feature has. What makes the shorter waits safe is
// the other half: the microphone now stays live through the "thinking"
// phase, and a teacher who carries on talking before Coach has said
// anything silently cancels the reply and keeps the same turn going (see
// watchForResume in useVoiceTurn and handleTurnComplete in TalkToMe). An
// end-of-turn guess that fires too early now costs a cancelled request
// nobody heard, instead of costing the teacher their sentence.
//
// The floor still sits above a natural mid-sentence pause. The recovery
// above is a safety net, not a licence to guess: it only covers the window
// before Coach is audible, so a wait short enough to fire mid-breath would
// still talk over a teacher once the reply started.
const CURVE: { speechMs: number; waitMs: number }[] = [
  { speechMs: 0, waitMs: 1500 },
  { speechMs: 1500, waitMs: 1200 },
  { speechMs: 4000, waitMs: 900 },
  { speechMs: 9000, waitMs: 750 },
]

export const MIN_SILENCE_MS = CURVE[CURVE.length - 1].waitMs
export const MAX_SILENCE_MS = CURVE[0].waitMs

// `speechMs` is time spent actually above the speech threshold this turn,
// not wall-clock time since the turn started — a teacher who opened the page
// and sat quietly for ten seconds has not been talking for ten seconds.

// How long someone has been talking is a weak signal, though. What they
// actually SAID is a much stronger one, and we have it: Deepgram runs with
// smart_format, so the live draft arrives punctuated.
//
// A finished question is the clearest handoff in conversation — "So what
// should I do?" — and waiting out a silence after one is the single most
// unnatural thing left in a spoken turn. A person answers that in about
// 200ms; this used to wait 1500. And the same signal works in reverse: a
// draft ending on "and", "because", "um" or a comma is someone mid-thought,
// and that deserves longer than the curve would give.
//
// A plain full stop is treated with more suspicion than a question mark,
// because Deepgram will happily end a sentence the teacher is going to
// continue — "I tried the door greeting." ... "but it didn't work." So a
// statement shortens the wait only part of the way.
const QUESTION_WAIT_MS = 400
const STATEMENT_CEILING_MS = 800
const MID_THOUGHT_WAIT_MS = 1800

/// The longest this function can return, whatever it is given. The caller
/// needs it for the backstop timer that covers a tab the browser has
/// stopped giving frames to.
export const LONGEST_WAIT_MS = Math.max(MAX_SILENCE_MS, MID_THOUGHT_WAIT_MS)

// Two lists, because the two kinds of evidence are not equally strong.
//
// These can never end an English sentence. A draft ending on one of them is
// mid-thought whatever punctuation Deepgram put there — "I talked to the."
// is a transcription of someone still talking.
const CANNOT_END_A_SENTENCE = new Set([
  // joining one clause to the next
  'and', 'but', 'or', 'because', 'cause', 'since', 'although', 'though',
  'while', 'whenever', 'unless', 'until', 'as', 'plus', 'than', 'that',
  'which',
  // left hanging
  'the', 'a', 'an', 'my', 'his', 'her', 'their', 'our', 'your', 'its',
  'these', 'those', 'to', 'for', 'with', 'about', 'at', 'in', 'on', 'of',
  'from', 'into', 'onto', 'is', 'was', 'were', 'be', 'been', 'am', 'are',
  'had', 'has', 'have', 'very', 'really',
])

// These CAN end a sentence, so they only count when Deepgram has not put a
// full stop there: "so what should I" is unfinished, where "That was me."
// plainly is not. Pronouns and reporting verbs are the common ones — a
// teacher mid-story is usually in the middle of "and then she said..."
const RARELY_ENDS_A_SENTENCE = new Set([
  'i', 'he', 'she', 'we', 'they', 'you', 'it', 'him', 'them', 'me', 'us',
  'said', 'says', 'told', 'tells', 'asked', 'asks', 'goes', 'went', 'called',
  'wanted', 'started', 'keeps', 'kept', 'tried', 'got', 'so', 'if', 'when',
  'then', 'also', 'who', 'like', 'well', 'um', 'uh', 'uhh', 'erm', 'er',
  'hmm', 'basically', 'actually', 'literally', 'mean', 'know', 'just',
  'kind', 'sort', 'maybe',
])

type Ending = 'question' | 'statement' | 'mid-thought' | 'unknown'

/// What the shape of a draft says about whether the teacher is done.
export function classifyEnding(transcript: string | null | undefined): Ending {
  const text = transcript?.trim() ?? ''
  if (!text) return 'unknown'
  // An ellipsis is Deepgram transcribing a trailing off, not a full stop.
  if (text.endsWith('...') || text.endsWith('…')) return 'mid-thought'
  if (text.endsWith(',')) return 'mid-thought'
  const lastWord = text.toLowerCase().replace(/[^a-z0-9'\s]/g, '').trim().split(/\s+/).pop() ?? ''
  // A word that cannot end a sentence outranks the punctuation after it.
  if (CANNOT_END_A_SENTENCE.has(lastWord)) return 'mid-thought'
  if (text.endsWith('?')) return 'question'
  if (text.endsWith('.') || text.endsWith('!')) return 'statement'
  // Unpunctuated, so Deepgram has not decided either — and these endings
  // mean it is very likely still coming. Leaning long here is what makes
  // leaning short on a finished question safe: the draft catches up a moment
  // later and the wait is recomputed.
  if (RARELY_ENDS_A_SENTENCE.has(lastWord)) return 'mid-thought'
  return 'unknown'
}

function fromCurve(speechMs: number): number {
  if (!Number.isFinite(speechMs) || speechMs <= 0) return MAX_SILENCE_MS
  for (let i = 1; i < CURVE.length; i++) {
    const prev = CURVE[i - 1]
    const next = CURVE[i]
    if (speechMs >= next.speechMs) continue
    const ratio = (speechMs - prev.speechMs) / (next.speechMs - prev.speechMs)
    return Math.round(prev.waitMs + ratio * (next.waitMs - prev.waitMs))
  }
  return MIN_SILENCE_MS
}

/// `transcript` is the live draft so far, or null when live transcription is
/// off or has not produced anything yet — in which case this behaves exactly
/// as it did before, on the curve alone.
///
/// Call this repeatedly while the silence runs rather than once when it
/// starts: the draft lags the teacher's voice by a couple of hundred
/// milliseconds, so at the instant they stop it may still end on "what
/// should I" and only become a question a moment later.
export function silenceWindowFor(speechMs: number, transcript?: string | null): number {
  const base = fromCurve(speechMs)
  switch (classifyEnding(transcript)) {
    case 'question':
      return QUESTION_WAIT_MS
    case 'statement':
      return Math.min(base, STATEMENT_CEILING_MS)
    case 'mid-thought':
      return Math.max(base, MID_THOUGHT_WAIT_MS)
    case 'unknown':
      return base
  }
}
