// The thinking sounds Coach makes while Claude writes, listed here so the
// server can recognise them and keep the audio forever.
//
// Everything else spoken in Talk It Through is said once and never again, so
// caching it would be pointless. These are the opposite: the same two dozen
// seconds of audio, for every teacher, in every conversation, for as long as
// the feature exists. Synthesizing them per conversation cost about a penny
// each time — more than Coach's actual thinking.
//
// Kept in step with FILLER_PHRASES in web/src/lib/voicePlayback.ts and
// shortFillers in iOS's SpeechPlayer.swift. A phrase that drifts out of this
// list still works — it is simply paid for every time, as any other sentence
// is, and misses the trimming in speechCache.ts.
//
// These are the openers — what Coach says at the top of a turn, before it
// has anything to say yet.
//
// Nothing starts with "Hmm" any more, here or below: two openers and three
// between-sentence phrases were dropped for it, and two of the jokes had the
// word swapped off the front. Aura renders a leading "hmm" short and clipped
// however it is faded, and the sound was asked for by name not to be used.
// "...well... hmm..." went with them: the clips fade at the end, so a phrase
// that finishes on a hum finishes on exactly the sound being removed. Two rules decided them, both measured:
//
//  - Under ~2.15s. A clip starts 250ms into the pause, Coach's first
//    sentence lands around 1.2s, and a clip with 1.2s or less left is
//    allowed to finish before Coach speaks (see handOffFromThinkingSound in
//    TalkToMe.tsx). Anything longer is faded out mid-word every turn.
//  - Ending in "..." rather than ".", which makes the voice trail off
//    instead of stopping dead. "Mm." trails for 0.05s; "Mm..." for 0.16s.
//
export const FILLER_PHRASES = [
  "Let me see...",
  "Well, let's see...",
  "Okay, let's see...",
  "Alright, let's see...",
  "So, let's see...",
  "Well, let me think...",
  "Okay, let me think...",
  "Let me take a moment...",
  "Just a moment...",
  "Give me a second...",
  "Let me gather my thoughts...",
  "Let's think about this...",
  "Well, now...",
  "Okay, so...",
  "Alright, then...",
]

// And these are what Coach says BETWEEN its own sentences, when Claude has
// not finished writing the next one. A different job from an opener: the
// teacher is already mid-answer, so "Let me think..." would sound like Coach
// forgetting what it was saying. These are the noises someone makes while
// still holding the floor.
//
// They lead with "..." on purpose — it lands Coach a beat late rather than
// jumping in, which is how the gap actually feels. The dead air Deepgram
// puts at the very front of the clip for it is trimmed in speechCache.ts;
// the pauses between the words are the point and are kept.
export const BETWEEN_FILLER_PHRASES = [
  "...well... okay then...",
  "...so... yeah...",
  "...okay... well, well...",
  "...well... you know...",
  "...I mean... yeah...",
  "...alrighty... so...",
  "...well... huh...",
  "...okay-dokey...",
  "...yeah... well...",
  "...so... um... yeah...",
  "...well... I mean...",
  "...okay... well then...",
  "...ah... okay...",
  "...right... right...",
  "...oh... well...",
  "...okay... so, yeah...",
]

// And a handful with a joke in them, for the same gaps.
//
// These are the one kind that must be heard to the end: "...my words took
// the scenic route..." faded after "...my words took the..." is worse than
// silence. So they are held longer than any other clip (the clients know
// them as a separate pool), drawn rarely — roughly one gap in four — and
// never when Coach has just reacted to something painful, which the client
// checks before it picks one. A hamster joke on top of a teacher in tears
// would be the worst thing this feature could do.
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

const lookup = new Set([...FILLER_PHRASES, ...BETWEEN_FILLER_PHRASES, ...WITTY_FILLER_PHRASES].map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}

// Both kinds of gap filler get the same treatment in speechCache.ts: dead
// air at the front trimmed, the pauses between their words shortened.
const gapLookup = new Set([...BETWEEN_FILLER_PHRASES, ...WITTY_FILLER_PHRASES].map((p) => p.toLowerCase()))

export function isGapFillerPhrase(text: string): boolean {
  return gapLookup.has(text.trim().toLowerCase())
}

const wittyLookup = new Set(WITTY_FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

/// A joke is allowed to run longer than a plain hesitation noise, since it
/// is only worth playing if its ending is heard.
export function isWittyFillerPhrase(text: string): boolean {
  return wittyLookup.has(text.trim().toLowerCase())
}
