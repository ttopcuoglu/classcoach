// How much of a recording actually became words.
//
// This exists because the report had no concept of it. Every gate was about
// DURATION — a 23-minute lesson cleared the "short session" banner and was
// presented as a full observation — while the thing that decides whether a
// reading means anything is the share of those 23 minutes the microphone
// resolved into speech. One real lesson came through at 15%: the first 8:23
// produced no transcript at all, a 7:40 stretch in the middle produced none
// either, and the report described the room as calm while the teacher
// remembered redirecting the class around ten times in the first five
// minutes. Nothing in the pipeline was in a position to notice.
//
// Derived from fields the analysis already stores rather than a new column,
// so it reads correctly on every session already in the database.

/// Only the two fields this needs, so any stored metricsDetail can be passed.
export type CoverageSource = {
  teacherTalkSec?: number | null
  studentTalkSec?: number | null
  totalDurationSec?: number | null
}

/// Null when there is nothing to divide by — an unanalyzed or empty session,
/// which is a different thing from a recording that captured nothing.
export function capturedShare(detail: CoverageSource | null | undefined, durationSec?: number | null): number | null {
  const total = detail?.totalDurationSec ?? durationSec ?? 0
  if (!total || total <= 0) return null
  const captured = (detail?.teacherTalkSec ?? 0) + (detail?.studentTalkSec ?? 0)
  return captured / total
}

/// Below this, a reading of the whole lesson is a reading of a minority of it.
/// Shared with the Hard Look, which arrived at the same number independently
/// for its airtime section.
export const MIN_SHARE_FOR_WHOLE_LESSON_CLAIM = 0.45

/// Claiming something did NOT happen needs more than finding that it did.
/// Finding a pattern is positive evidence and survives a patchy recording;
/// "this didn't happen in your lesson" is a claim about the silence, and the
/// silence is exactly what a room mic gets wrong. Set above
/// MIN_SHARE_FOR_WHOLE_LESSON_CLAIM on purpose: the asymmetry is the point.
export const MIN_SHARE_FOR_ABSENCE_CLAIM = 0.5

/// Whether the recording is solid enough to say a thing was absent, rather
/// than merely unheard.
export function canClaimAbsence(share: number | null): boolean {
  return share != null && share >= MIN_SHARE_FOR_ABSENCE_CLAIM
}

export function sharePct(share: number | null): number | null {
  return share == null ? null : Math.round(share * 100)
}

/// One sentence a teacher can read, naming the recording as the limit rather
/// than their teaching. Never says "no data" — that reads as a glitch and
/// blames the wrong thing.
export function coverageCaveat(share: number | null): string | null {
  const pct = sharePct(share)
  if (pct == null) return null
  if (share != null && share >= MIN_SHARE_FOR_ABSENCE_CLAIM) return null
  return `Only about ${pct}% of this recording came through as speech the microphone could resolve. What follows is drawn from that portion, and the quiet stretches are as likely to be distance or overlapping voices as a quiet room.`
}
