// What each second of the recording was, as the server worked it out once
// the teacher said which voice was them and which, if any, was a video
// (server/src/lib/roomTrace.ts). A second is the teacher's or a student's
// only when the transcript has their words in it, or a short pause between
// them; a voice with no words goes to no one and is shown with other sounds.
//
// Only lessons analysed since that existed carry it. Everything older keeps
// the report's earlier split (talkFlow.ts).

import type { AudioSessionWithSegments } from './api'

export type RoomKind = 'teacher' | 'student' | 'video' | 'other' | 'quiet'

export type RoomBreakdown = {
  /// One kind per second, in lesson order; null where there was too little
  /// audio to say.
  seconds: (RoomKind | null)[]
  /// Percentages of the recording, adding to 100 over the seconds that could
  /// be read.
  pct: Record<RoomKind, number>
  /// Seconds of a tagged video, and of voices no one's words were heard in,
  /// for saying what "other sounds" holds.
  videoSec: number
  unclearSec: number
}

const KIND: Record<string, RoomKind> = { t: 'teacher', s: 'student', g: 'student', x: 'video', u: 'other', o: 'other', q: 'quiet' }

/// Read from metricsLogs: the server sends metricsDetail as numbers only, and
/// the trace is text.
export function roomBreakdown(metricsLogs: AudioSessionWithSegments['metricsLogs']): RoomBreakdown | null {
  const trace = metricsLogs?.roomTrace
  if (typeof trace !== 'string' || trace.length === 0) return null
  const seconds = Array.from(trace, (c) => KIND[c] ?? null)
  const count: Record<RoomKind, number> = { teacher: 0, student: 0, video: 0, other: 0, quiet: 0 }
  for (const k of seconds) if (k) count[k]++
  const read = Object.values(count).reduce((a, b) => a + b, 0)
  if (read === 0) return null
  const pct = Object.fromEntries(Object.entries(count).map(([k, n]) => [k, (n / read) * 100])) as Record<RoomKind, number>
  return {
    seconds,
    pct,
    videoSec: count.video,
    unclearSec: Array.from(trace).filter((c) => c === 'u').length,
  }
}
