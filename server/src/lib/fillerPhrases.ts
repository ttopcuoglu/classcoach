// The thinking sounds Coach makes while Claude writes, listed here so the
// server can recognise them and keep the audio forever.
//
// Everything else spoken in Talk It Through is said once and never again, so
// caching it would be pointless. These are the opposite: the same two dozen
// seconds of audio, for every teacher, in every conversation, for as long as
// the feature exists. Synthesizing them per conversation cost about a penny
// each time — more than Coach's actual thinking.
//
// Kept in step with FILLER_PHRASES and LONGER_FILLER_PHRASES in
// web/src/lib/voicePlayback.ts and the pair in iOS's SpeechPlayer.swift. A
// phrase that drifts out of this list still works — it is simply paid for
// every time, as any other sentence is.
export const FILLER_PHRASES = [
  'Mm-hmm.',
  'Hmm.',
  'I see.',
  'Right.',
  'Okay.',
  'Yeah.',
  'Got it.',
  'Okay, so...',
  'Mm, okay.',
  'Right, okay.',
  'Let me think.',
  'Hmm, let me think about that.',
  'Okay, let me think for a second.',
  "Hmm, let's see.",
  'Give me a second here.',
]

const lookup = new Set(FILLER_PHRASES.map((phrase) => phrase.toLowerCase()))

export function isFillerPhrase(text: string): boolean {
  return lookup.has(text.trim().toLowerCase())
}
