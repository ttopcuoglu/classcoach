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
// Grouped by what they actually do, because a list of "Let me X" variants
// reads as one phrase in six wrappers. Sixteen phrases, five ideas.
export const THINKING_PHRASES = [
  // thinking about it
  "Let me see...",
  "Let me think...",
  "Okay, let me see...",
  "Okay, let me think...",
  "Alright, let me think...",
  // working it out, which is a different claim from thinking about it
  "Let me think it through...",
  "Let me work through that...",
  "Let's think about this...",
  "Let me think about that one...",
  // asking for the time outright
  "Give me a second...",
  "Just a second...",
  "Give me a second here...",
  "Let me take a moment...",
  "Let me sit with that a second...",
  // turning towards the answer
  "Okay, so...",
  "Right, so...",
  "Well, now...",
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

const lookup = new Set([...FILLER_PHRASES, ...THINKING_PHRASES].map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
