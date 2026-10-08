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
// Kept in step with ACKNOWLEDGEMENTS in web/src/lib/voicePlayback.ts and
// SpeechPlayer.swift.
export const FILLER_PHRASES = [
  "Yeah.",
  "Right.",
  "Okay.",
  "Sure.",
  "Got it.",
  "I see.",
  "Oh, okay.",
  "Yeah, okay.",
  "Right, yeah.",
  "Ah, okay.",
  "Okay, sure.",
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

const lookup = new Set(FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
