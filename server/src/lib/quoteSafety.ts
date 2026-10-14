// Whether a transcript quote is safe to show a teacher as their own words.
//
// Every model read in this codebase verifies its quotes against the
// transcript, which stops the model inventing a sentence. It does nothing
// about the transcript itself being wrong, and on real lessons it is wrong in
// ways that matter. One recording has "River, ice forward, buddy" where the
// teacher said "eyes forward"; the same teacher appears to say "Shut up" in
// two different lessons; a consequence is "DBS" at 13:14 and "DPSs" forty
// seconds later.
//
// A mangled quote inside a supportive note is a shrug. The same quote inside
// a section about losing control of a room is an accusation built on a
// mis-transcription, and there is no version of that a teacher should have to
// read. So the harsh sections show the moment and withhold the wording when
// the wording cannot be trusted.

/// "the the", "working working" — the clearest signal that a stretch is
/// transcription noise rather than speech.
const DOUBLED_WORD = /\b([a-z]{2,})\s+\1\b/i

/// Language whose misquotation is damaging enough that it is not worth the
/// risk of being right. These are not words a teacher may not say — they are
/// words we will not put in her mouth on the strength of a room mic. The
/// moment is still reported; only the quote is withheld.
const UNSAFE_TO_ATTRIBUTE = [
  'shut up', 'shut it', 'shut your', 'stupid', 'idiot', 'dumb', 'damn', 'hell',
  'stop being', 'acting like', 'babies', 'childish',
]

export function readsAsSpeech(text: string): boolean {
  return !DOUBLED_WORD.test(text)
}

/// Fails on garble, on language we will not attribute, and on fragments too
/// short to carry their own context — "And quiet." quoted alone reads as
/// barking at a room when it may have ended a full sentence.
export function safeToQuote(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 12) return false
  if (!readsAsSpeech(trimmed)) return false
  const low = trimmed.toLowerCase()
  return !UNSAFE_TO_ATTRIBUTE.some((phrase) => low.includes(phrase))
}

/// The quote if it can be shown, null otherwise — so a caller cannot forget
/// to check and leak the raw text.
export function quoteOrNull(text: string | null | undefined): string | null {
  if (!text) return null
  return safeToQuote(text) ? text.trim() : null
}
