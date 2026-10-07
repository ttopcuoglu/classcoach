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
// Two rules decided this list, both measured:
//
//  - Under ~1.35s. The filler starts 250ms into the pause and Coach's
//    first sentence lands around 1.2s, and a clip with 400ms or less left
//    is allowed to finish before Coach speaks (see handOffFromThinkingSound
//    in TalkToMe.tsx). Anything longer than that is faded out mid-word every
//    turn — measured out: "Okay, let me think..." runs 1.96s.
//  - Ending in "..." rather than ".", which makes the voice trail off
//    instead of stopping dead. "Mm." trails for 0.05s; "Mm..." for 0.16s.
//    "Mm-hmm." is the exception, measuring better with the full stop.
export const FILLER_PHRASES = [
  'Hmm...',
  'Mm-hmm.',
  'Mm, mm...',
  'Hmm, hmm...',
  'Yeah...',
  'Yep...',
  'Ah...',
  'Okay...',
  'Right...',
  'Sure...',
  'Uh-huh...',
  'Got it...',
  'Well...',
  'So...',
  'Alright...',
  'Well, hmm...',
  'So, hmm...',
  'Right, hmm...',
  'Let me see...',
  'Well, let me think...',
]

const lookup = new Set(FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
