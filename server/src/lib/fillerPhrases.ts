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

const lookup = new Set(FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
