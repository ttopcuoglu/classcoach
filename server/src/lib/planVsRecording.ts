// Comparing a plan a teacher had reviewed against the recording of them
// teaching it.
//
// This is the handoff the consolidation is really for. Look It Over read a
// plan on Sunday and said the discussion would need twelve minutes. Lesson
// Debrief heard Tuesday's lesson and measured four. Neither surface could say
// the useful thing on its own, and no amount of making each one better would
// have let it: the sentence needs both halves.
//
// What makes it honest rather than a gotcha is the framing. A plan is a
// prediction, and a lesson that diverges from its plan is often a teacher
// reading the room correctly. So the comparison reports the gap and declines
// to grade it.

import { formatTimingRange, parseTimingBasis, type TimingBasis } from './reviewEdits.ts'

export type PlanComparison = {
  /// What the plan allocated, as the review understood it.
  planned: string
  /// What the recording suggests, as a range where the measurement allows.
  actual: string
  /// The sentence shown on the report.
  line: string
  /// Why this might be fine. Always present — a gap is information, not a
  /// finding against the teacher.
  caveat: string
}

/// Minutes of real instructional time in a recording.
///
/// Uses the recorded duration rather than any planned period length, because
/// that is the only number the recording actually establishes.
function recordedMinutes(durationSec: number | null | undefined): number | null {
  if (durationSec == null || durationSec <= 0) return null
  return Math.round(durationSec / 60)
}

/// Below this, a recording is too short to compare against a plan at all.
///
/// Comparing a four-minute clip to a forty-minute plan would produce a
/// dramatic-looking gap that says nothing except that the teacher stopped
/// recording. Matches TINY_RECORDING_THRESHOLD_SEC on the client.
export const MIN_SECONDS_TO_COMPARE = 120

/// The comparison, or null when there is nothing honest to say.
///
/// Null is the common case and the caller renders nothing for it: no linked
/// plan, no timing estimate in the review, or a recording too short to
/// compare. None of those are errors and none deserve a panel explaining
/// themselves — the report simply does not carry this line.
export function comparePlanToRecording(options: {
  /// The review's timing estimate, from the `fits_the_period` or
  /// `timing_realism` lens.
  timingBasis: unknown
  durationSec: number | null | undefined
  /// What the plan said this time was for, if the review named it.
  /// Falls back to the whole lesson.
  planLabel?: string | null
}): PlanComparison | null {
  const basis = parseTimingBasis(options.timingBasis)
  if (!basis) return null
  const actualMinutes = recordedMinutes(options.durationSec)
  if (actualMinutes == null) return null
  if ((options.durationSec ?? 0) < MIN_SECONDS_TO_COMPARE) return null

  const planned = formatTimingRange(basis)
  const [low, high] = basis.minutes
  const label = options.planLabel?.trim() || 'this lesson'

  // Only reported when the recording falls outside the predicted range.
  // Inside it, the plan and the lesson agree and saying so would be noise on
  // a report that already has plenty to read.
  if (actualMinutes >= low && actualMinutes <= high) return null

  const shorter = actualMinutes < low
  return {
    planned,
    actual: `about ${actualMinutes} minutes`,
    line: shorter
      ? `You planned ${planned} for ${label}; the recording suggests about ${actualMinutes}.`
      : `You planned ${planned} for ${label}; the recording ran about ${actualMinutes}.`,
    // The caveat is not hedging. A lesson that diverges from its plan is
    // frequently a teacher reading the room correctly, and a report that
    // presented the gap as a failure would be teaching them to follow a plan
    // over their own judgment.
    caveat: shorter
      ? 'That might be the right call — a room that has it already does not need the full time. Worth knowing either way.'
      : 'Running longer is often the right call when something is landing. Worth knowing where the time went.',
  }
}

/// The plan's timing estimate pulled off a review's lenses.
///
/// Looks at the two lenses that estimate time, in the order a plan would
/// carry them. Returns null when neither produced one, which is normal: a
/// teacher can review a plan with the timing lens turned off.
export function planTimingFrom(review: { timingBasis: unknown }): TimingBasis | null {
  return parseTimingBasis(review.timingBasis)
}
