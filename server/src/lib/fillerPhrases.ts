// What Coach says in the second between a teacher finishing and Coach's own
// first word arriving.
//
// These used to be thinking noises — "Let me see...", "Well, let me
// think...", and before that a wordless hum. Two recordings of conversations
// that actually sound right settled it against all of them: what a real
// coach says there is an ACKNOWLEDGEMENT. "Yeah." "Right." "Classic." The
// gap is the same length either way, and the message is the opposite — one
// says "I heard you", the other says "wait".
//
// Measured on the better of those recordings, the coach's handoffs ran
// 720ms to 1331ms, slower than Coach manages today. So the immediacy was
// never speed; it was that the first sound out meant something.
//
// They have to fit ANY turn, because the clip is chosen before Claude has
// read a word of what the teacher said. That rules out the reactions the
// recording could afford — "Classic." is wrong if the teacher just described
// something serious, and "Oh, that's rough." is wrong if they are reporting
// a win. It also rules out "I hear you", which the system prompt lists as an
// assistant tic to avoid.
//
// Trimmed to five on request, and the four bare single words went first —
// "Yeah.", "Right.", "Okay.", "Sure." Which is the same set Aura renders
// least reliably and the same set the prompt had to forbid Coach from
// opening with, so the three constraints agreed for once.
//
// Kept in step with web/src/lib/voicePlayback.ts, SpeechPlayer.swift, and
// the opener rule in TALK_SYSTEM_PROMPT — if a phrase is not played here,
// Coach should not be banned from saying it.
export const FILLER_PHRASES = [
  "Got it.",
  "I see.",
  "Oh, okay.",
  "Yeah, okay.",
  "Right, yeah.",
]

// And what Coach says when the teacher asked it something.
//
// An acknowledgement only fits when the teacher has TOLD Coach something.
// Answering "What do you recommend?" with "Yeah." is the wrong noise — it
// agrees with a question. Reported as "the filler sometimes doesn't make
// sense with what I asked", and that is exactly when.
//
// So the pool is chosen by what the teacher just did: a question gets one of
// these, anything else gets an acknowledgement. The client decides, since it
// has the transcript and Claude has not seen it yet.
// And two pools for the turns where neither an acknowledgement nor a
// thinking sound is the right noise.
//
// "Got it." after "I cried in my car at lunch" is cold, and after "the essay
// finally went well" it is flat. Both are statements, so the question-mark
// test could not tell them apart. These mirror two of the reactions the
// system prompt already offers Coach — feeling it with them, and genuinely
// pleased — and which pool plays is decided by moodOf() in turnMood.ts,
// which errs towards the neutral acknowledgement whenever it is unsure.
export const HARD_TURN_PHRASES = [
  "Oh, that's a lot.",
  "Yeah, that's hard.",
  "That sounds rough.",
  "Ugh, that's a lot.",
  "Oh, that's rough.",
  "Yeah, that's a lot.",
]

export const GLAD_TURN_PHRASES = [
  "Oh, nice.",
  "That's a win.",
  "Oh, good.",
  "Nice one.",
  "Oh, that's good.",
]

// Every one opens with "Um," on request, and the comma is not a typo. Written
// the way it was asked for — "Um... let me see..." — Aura reads the first
// ellipsis as a sentence break and drops a pause into the middle of a clip
// whose whole job is to cover one second. Measured: "Um... give me a second
// here..." came back 4500ms long with 512ms of sound in it, and "Hmm... let
// me see..." drew 1620ms once and 4620ms the next time from the identical
// request. With a comma the same fourteen phrases land between 1027ms and
// 2540ms, every time.
//
// The trailing ellipsis stays, because that one is doing real work: it is
// what makes the phrase trail off instead of stopping.
export const THINKING_PHRASES = [
  "Um, let me see...",
  "Um, let me think...",
  "Um, okay, let me see...",
  "Um, okay, let me think...",
  "Um, alright, let me think...",
  "Um, let me think it through...",
  "Um, let me work through that...",
  "Um, let's think about this...",
  "Um, let me think about that one...",
  "Um, give me a second...",
  "Um, just a second...",
  "Um, give me a second here...",
  "Um, let me take a moment...",
  "Um, let me sit with that a second...",
]

// The jokes that used to sit here are gone, and the reason is worth keeping.
// A clip is chosen before Claude has read a word the teacher said, so a
// recorded joke can only ever be generic — and rendered in exactly the same
// voice and tone as the advice that follows, it was heard as part of the
// answer rather than as an aside. Judged as content, "the mental hamster is
// running" is a weak line about nothing in particular.
//
// So the humour moved into the reply itself, where Coach can be funny about
// the actual class ("twenty-two of them and one glue stick, sure") and the
// system prompt already says how. A filler's job is to cover a second of
// dead air honestly, which "Yeah." does without ever being mistaken for
// advice.

const lookup = new Set(
  [...FILLER_PHRASES, ...THINKING_PHRASES, ...HARD_TURN_PHRASES, ...GLAD_TURN_PHRASES].map((p) => p.toLowerCase()),
)

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
