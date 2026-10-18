// Mirrors server/src/lib/quoteSafety.ts, for quotes the web takes straight
// from transcript segments rather than from a model read the server already
// verified — the fast-stretch line is the one that does.
//
// On a real lesson the second-fastest stretch contained "Shut up", most likely
// a mis-transcription. The moment is still reported; only the wording is
// withheld.

const DOUBLED_WORD = /\b([a-z]{2,})\s+\1\b/i

/// Not words a teacher may not say — words we will not put in their mouth on
/// the strength of a room microphone.
const UNSAFE_TO_ATTRIBUTE = [
  'shut up', 'shut it', 'shut your', 'stupid', 'idiot', 'dumb', 'damn', 'hell',
  'stop being', 'acting like', 'babies', 'childish',
]

export function safeToQuote(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 12) return false
  if (DOUBLED_WORD.test(trimmed)) return false
  const low = trimmed.toLowerCase()
  return !UNSAFE_TO_ATTRIBUTE.some((phrase) => low.includes(phrase))
}
