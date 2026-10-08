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

// And a handful with a joke in them, for the same slot.
//
// These are the one kind that must be heard to the end: "...my words took
// the scenic route..." faded after "...my words took the..." is worse than
// silence. So Coach's next sentence waits one out however long it runs,
// which is also why they are rare — one turn in four — and never two
// running. Never in a turn where the teacher's own words sounded hard,
// either; the client checks that before it picks one.
export const WITTY_FILLER_PHRASES = [
  "...well... the wheels are turning...",
  "...so... little mental pit stop...",
  "...so... a little traffic upstairs...",
  "...well... my words took the scenic route...",
  "...so... the gears are warming up...",
  "...well... just catching a wandering thought...",
  "...well... one brain cell at a time...",
  "...so... the mental hamster is running...",
  "...well... my brain and mouth are negotiating...",
]

// Nothing plays between Coach's own sentences any more. There was a pool of
// twenty two-word phrases for that, and then a quiet hum, and both are gone:
// a sound in that gap was asked for and then asked to be removed, and the
// silence is what the recordings have there anyway. The gap itself stays —
// see SENTENCE_GAP_MS in voicePlayback.ts.

const lookup = new Set([...FILLER_PHRASES, ...WITTY_FILLER_PHRASES].map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}

const wittyLookup = new Set(WITTY_FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

/// A joke is allowed to run longer than a plain acknowledgement, since it is
/// only worth playing if its ending is heard.
export function isWittyFillerPhrase(text: string): boolean {
  return wittyLookup.has(text.trim().toLowerCase())
}
