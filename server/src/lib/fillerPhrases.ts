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
// has anything to say yet. Two rules decided them, both measured:
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
  "Hmm, let me think...",
  "Let me take a moment...",
  "Just a moment...",
  "Give me a second...",
  "Let me gather my thoughts...",
  "Let's think about this...",
  "Well, now...",
  "Okay, so...",
  "Alright, then...",
  "Hmm, okay...",
]

// A breath before "Let me think..." reads as someone gathering themselves.
// A breath before "Okay, so..." reads as someone about to make a speech, so
// only the ones that are already a thought get one.
export const BREATHY_PHRASES = new Set([
  "Let me see...",
  "Well, let's see...",
  "Okay, let's see...",
  "Alright, let's see...",
  "So, let's see...",
  "Well, let me think...",
  "Okay, let me think...",
  "Hmm, let me think...",
  "Let me take a moment...",
  "Let me gather my thoughts...",
  "Let's think about this...",
])

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
  "...hmm... alrighty...",
  "...so... yeah...",
  "...okay... well, well...",
  "...well... you know...",
  "...I mean... yeah...",
  "...hmm... okay, okay...",
  "...alrighty... so...",
  "...well... huh...",
  "...okay-dokey...",
  "...yeah... well...",
  "...so... um... yeah...",
  "...well... I mean...",
  "...hmm... right...",
  "...okay... well then...",
  "...ah... okay...",
  "...right... right...",
  "...oh... well...",
  "...okay... so, yeah...",
  "...well... hmm...",
]

const lookup = new Set([...FILLER_PHRASES, ...BETWEEN_FILLER_PHRASES].map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}

const betweenLookup = new Set(BETWEEN_FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isBetweenFillerPhrase(text: string): boolean {
  return betweenLookup.has(text.trim().toLowerCase())
}
