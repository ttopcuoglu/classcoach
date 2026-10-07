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
//  - Under ~0.9s. The filler starts 400ms into the pause and Coach's first
//    sentence lands around 1.2s, so anything longer is faded out mid-word
//    every single time. That rules out every two-part phrase, because the
//    voice puts a real pause at the comma: "Mm, okay..." runs 2.5s.
//  - Ending in "..." rather than ".", which makes the voice trail off
//    instead of stopping dead. "Mm." trails for 0.05s; "Mm..." for 0.16s.
//    "Mm-hmm." is the exception, measuring better with the full stop.
export const FILLER_PHRASES = [
  'Mm...',
  'Mm-hmm.',
  'Mhm...',
  'Hmm...',
  'Hm...',
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
]

const lookup = new Set(FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
