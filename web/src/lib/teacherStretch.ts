// The longest stretch of unbroken teacher talk — the web twin of the
// server's lib/teacherStretch.ts, kept to the same rule so the page and the
// stored metric agree on one number.
//
// A stretch ends when another voice is heard, or when the teacher stops for
// longer than a pause: silence that long is students working, a video, or a
// voice the microphone missed — not the teacher still talking. It is
// reported as the time it took in the room, with the words it opened on.

import type { TranscriptSegment } from './api'

/// Longer than a breath or a glance at notes; shorter than waiting on a room.
export const STRETCH_PAUSE_BREAK_SEC = 10

export type TeacherStretch = {
  startSec: number
  endSec: number
  durationSec: number
  /// The first line of the stretch, as said.
  opening: string
  /// Every line in it, in order — so the page can quote the first one that
  /// is safe to show when the opening is not.
  lines: { text: string; startSec: number }[]
}

export function longestTeacherStretch(segments: TranscriptSegment[]): TeacherStretch | null {
  let best: TeacherStretch | null = null
  let run: { startSec: number; endSec: number; opening: string; lines: { text: string; startSec: number }[] } | null = null
  const close = () => {
    if (!run) return
    const durationSec = run.endSec - run.startSec
    if (!best || durationSec > best.durationSec) best = { ...run, durationSec }
    run = null
  }
  for (const segment of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    const text = segment.text.trim()
    if (segment.speakerLabel !== 'Teacher') {
      if (text) close()
      continue
    }
    if (!text) continue
    if (run && segment.startSec - run.endSec > STRETCH_PAUSE_BREAK_SEC) close()
    if (!run) run = { startSec: segment.startSec, endSec: segment.endSec, opening: text, lines: [] }
    else run.endSec = Math.max(run.endSec, segment.endSec)
    run.lines.push({ text, startSec: segment.startSec })
  }
  close()
  return best
}
