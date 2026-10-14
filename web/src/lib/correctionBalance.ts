// Redirections set against encouragement, for one lesson.
//
// Neither number is new — redirectionCount, positivePhraseCount and
// correctivePhraseCount have been computed on every lesson for months. What
// was missing is the PAIRING, and the pairing is the part that means
// something: one real lesson carries six redirections and zero encouragement,
// which is the mechanism behind a teacher having to escalate. When correction
// is the only thing a student hears from you, each correction is worth less
// than the last. Six and zero said nothing on its own in the PDF's stat strip
// and was absent from the screen altogether.
//
// Three rules this must never break:
//
// 1. Zero positives means NONE DETECTED, never none given. Only 4 of 13 real
//    lessons register a single positive. Detection is better than it sounds —
//    Claude reads the transcript for these and the phrase lists are only a
//    fallback, so "You did beautiful job there" and "Good questions, people"
//    are both caught — but a read still misses, and warmth the microphone
//    never captured cannot be read at all. On the lesson that prompted this
//    card only 48% came through.
// 2. It is never a score. There is no correct ratio here and no target to
//    hit; the research-backed 4:1 would be a stick to beat a teacher with on
//    evidence this thin.
// 3. On a recording the microphone largely lost, these counts describe the
//    audible minority and have to say so.

import { LOW_CAPTURE_PCT } from './reportConfidence'

/// Below this, "N redirections and no encouragement" is not a pattern, it is
/// two small numbers. Three is also the floor the escalation read uses for a
/// run of asks, for the same reason.
const MIN_REDIRECTIONS_FOR_PATTERN = 3

export type CorrectionBalance = {
  redirections: number
  /// Encouragement DETECTED. The wording everywhere downstream has to carry
  /// that qualifier.
  positives: number
  correctives: number
  /// The headline reading, or null when the numbers cannot carry one.
  line: string | null
  /// True when the detector's own weakness has to be stated alongside.
  detectionCaveat: boolean
  /// True when the recording heard too little for these to describe a lesson.
  coverageCaveat: boolean
  /// Nothing worth rendering at all.
  empty: boolean
}

export function buildCorrectionBalance(
  detail: { redirectionCount?: number | null; positivePhraseCount?: number | null; correctivePhraseCount?: number | null } | null | undefined,
  capturedSharePct: number | null,
): CorrectionBalance {
  const redirections = detail?.redirectionCount ?? 0
  const positives = detail?.positivePhraseCount ?? 0
  const correctives = detail?.correctivePhraseCount ?? 0
  const lowCapture = capturedSharePct != null && capturedSharePct < LOW_CAPTURE_PCT

  // Nothing at all came through, on a recording that heard little. The
  // escalation card above already explains why; a row of zeroes underneath it
  // adds nothing and reads like a finding.
  const nothingHeard = redirections === 0 && positives === 0 && correctives === 0
  if (nothingHeard && lowCapture) {
    return { redirections, positives, correctives, line: null, detectionCaveat: false, coverageCaveat: true, empty: true }
  }

  let line: string | null = null
  let detectionCaveat = false

  if (redirections >= MIN_REDIRECTIONS_FOR_PATTERN && positives === 0) {
    // The case this card exists for.
    line = `${redirections} redirections came through and no encouragement did. If that is close to the balance students heard, each correction carries less weight than the one before it.`
    detectionCaveat = true
  } else if (redirections >= MIN_REDIRECTIONS_FOR_PATTERN && positives < redirections) {
    line = `More redirections came through than encouragement — ${redirections} to ${positives}.`
    detectionCaveat = true
  } else if (positives > 0 && positives >= redirections) {
    line =
      redirections === 0
        ? `${positives} moment${positives === 1 ? '' : 's'} of encouragement came through, and no redirections did.`
        : `Encouragement outweighed redirection in what the recording caught — ${positives} to ${redirections}.`
  } else if (nothingHeard) {
    line = 'Neither redirections nor encouragement were picked up in this recording.'
    detectionCaveat = true
  }

  return {
    redirections,
    positives,
    correctives,
    line,
    detectionCaveat,
    coverageCaveat: lowCapture,
    empty: false,
  }
}

/// The sentence that keeps "0 detected" from reading as "0 happened".
///
/// An earlier version of this said encouragement was "picked up from a short
/// list of phrases", which was wrong in a way that undersold it: the phrase
/// lists are only a fallback for when the model read returns nothing. On one
/// real lesson 7 of 9 tone moments were found by the read alone — "You did
/// beautiful job there", "Abigail's piece of is wonderful", "Good questions,
/// people" — none of which any list would hold. The real limits are that a
/// read can still miss, and that nothing the microphone lost can be read at
/// all.
export const DETECTION_CAVEAT =
  'These are read from the transcript rather than matched against a word list, so phrasing like "you did a beautiful job there" is caught. It can still miss, and anything the microphone did not pick up cannot be read at all — so treat a zero as "not found in what was captured", not as "not given".'

export function coverageCaveatLine(capturedSharePct: number | null): string {
  return `About ${capturedSharePct}% of this recording came through as speech, so these counts describe that portion rather than the whole lesson.`
}
