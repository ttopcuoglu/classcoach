// What the recording held, second by second, and how fast the teacher spoke
// across the lesson — the data behind the Talk & Pace charts.
//
// "Other voices" is speech the transcript did not attribute to the teacher.
// It is not called students: telling students from the teacher is the split
// this report does not trust (lib/teacherVoice.ts), and some of it may be the
// teacher. Quiet and sound-with-no-words come from the loudness envelope,
// which needs no speaker split at all.

import type { TranscriptSegment } from './api'

export type FlowKind = 'you' | 'other' | 'sound' | 'quiet' | 'unknown'

/// Percentages of the recording, adding to 100.
export type TalkShares = Record<FlowKind, number>

export type FlowModel = {
  shares: TalkShares
  /// One kind per bin, in lesson order: what most of that slice of the
  /// recording was.
  bins: FlowKind[]
  binSec: number
  /// False for recordings made before the loudness envelope: quiet and sound
  /// cannot be told apart there, and both are "unknown".
  hasEnvelope: boolean
}

const MAX_BINS = 120

/// Each second of the recording as one kind. Speech comes from the transcript
/// (yours wins where two lines overlap); everything else from the envelope.
function kindsBySecond(segments: TranscriptSegment[], total: number, seconds?: string | null): FlowKind[] {
  const kinds: FlowKind[] = Array.from({ length: total }, (_, sec) => {
    const c = seconds?.[sec]
    return c === 'q' ? 'quiet' : c === 's' ? 'sound' : 'unknown'
  })
  const mark = (s: TranscriptSegment, kind: FlowKind) => {
    for (let sec = Math.max(0, Math.floor(s.startSec)); sec < Math.min(total, Math.ceil(s.endSec)); sec++) {
      if (kind === 'you' || kinds[sec] !== 'you') kinds[sec] = kind
    }
  }
  for (const s of segments) if (s.speakerLabel !== 'Teacher' && s.text.trim()) mark(s, 'other')
  for (const s of segments) if (s.speakerLabel === 'Teacher' && s.text.trim()) mark(s, 'you')
  return kinds
}

/// The recording's make-up, and its flow across the lesson.
///
/// `youPct` is the stored talk share the rest of the report shows. When it is
/// given it is used as-is, and the rest of the recording is shared out among
/// the other kinds in proportion to their seconds — so this chart and the
/// Summary never show two different numbers for the same thing.
export function buildFlow(
  segments: TranscriptSegment[],
  durationSec: number,
  seconds?: string | null,
  youPct?: number | null,
): FlowModel | null {
  const total = Math.ceil(durationSec)
  if (total <= 0) return null
  const kinds = kindsBySecond(segments, total, seconds)
  const count: TalkShares = { you: 0, other: 0, sound: 0, quiet: 0, unknown: 0 }
  for (const k of kinds) count[k]++

  const shares: TalkShares = { you: 0, other: 0, sound: 0, quiet: 0, unknown: 0 }
  if (youPct != null) {
    shares.you = youPct
    const rest = Math.max(0, 100 - youPct)
    const restSeconds = count.other + count.sound + count.quiet + count.unknown
    if (restSeconds === 0) shares.unknown = rest
    else for (const k of ['other', 'sound', 'quiet', 'unknown'] as const) shares[k] = (count[k] / restSeconds) * rest
  } else {
    for (const k of Object.keys(count) as FlowKind[]) shares[k] = (count[k] / total) * 100
  }

  const binCount = Math.min(MAX_BINS, total)
  const binSec = total / binCount
  const bins: FlowKind[] = []
  for (let b = 0; b < binCount; b++) {
    const tally: TalkShares = { you: 0, other: 0, sound: 0, quiet: 0, unknown: 0 }
    for (let sec = Math.floor(b * binSec); sec < Math.min(total, Math.floor((b + 1) * binSec) || 1); sec++) tally[kinds[sec]]++
    // Your speech wins a tie: a bin you spoke in is a bin you spoke in.
    bins.push((['you', 'other', 'sound', 'quiet', 'unknown'] as const).reduce((best, k) => (tally[k] > tally[best] ? k : best), 'you'))
  }
  return { shares, bins, binSec, hasEnvelope: !!seconds }
}

export type PacePoint = { startSec: number; endSec: number; wpm: number | null }

/// A minute with less of your speech than this has no pace: a rate off a few
/// words would swing wildly and mean nothing.
export const MIN_PACE_SPEECH_SEC = 15

/// Your words a minute, minute by minute, from your own lines only. A line
/// that crosses a minute boundary counts in each minute for the part spoken
/// in it.
export function buildPace(segments: TranscriptSegment[], durationSec: number, windowSec = 60): PacePoint[] {
  const total = Math.ceil(durationSec)
  if (total <= 0) return []
  const teacher = segments.filter((s) => s.speakerLabel === 'Teacher' && s.text.trim() && s.endSec > s.startSec)
  const points: PacePoint[] = []
  for (let start = 0; start < total; start += windowSec) {
    const end = Math.min(total, start + windowSec)
    let speech = 0
    let words = 0
    for (const s of teacher) {
      const overlap = Math.min(s.endSec, end) - Math.max(s.startSec, start)
      if (overlap <= 0) continue
      const length = s.endSec - s.startSec
      speech += overlap
      words += (s.text.trim().split(/\s+/).length * overlap) / length
    }
    points.push({ startSec: start, endSec: end, wpm: speech >= MIN_PACE_SPEECH_SEC ? Math.round((words / speech) * 60) : null })
  }
  return points
}
