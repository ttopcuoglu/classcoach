// The longest stretch of unbroken teacher talk, measured so that it means it.
//
// The first version ended a stretch only when a student segment was
// transcribed. Read against real lessons, that made "uninterrupted" mean "no
// student was picked up in between": one stretch ran from 9:29 to 27:50
// across a video, another was a Chromebook hand-out, and a third was four
// students reading aloud whom the microphone never caught. It also summed
// only the seconds of speech, so an eighteen-minute span was reported as 136
// seconds, and quoted the stretch's last line under its first line's time.
//
// So a stretch now also ends when the teacher stops for longer than a pause.
// Silence that long is students working, a video, or a voice the microphone
// missed — not the teacher still talking. What is left is continuous talk,
// reported as the time it actually took, with the words it opened on.
//
// Shared by the analysis (the stored highlight and metric) and the Hard Look
// (which recomputes it for reports that already exist), because handing a
// model two different numbers for one stretch is how it once wrote about a
// "second six-minute run" that never happened.

import type { Segment } from './audioAnalysis.ts'

/// Longer than a breath or a glance at notes; shorter than waiting on a room.
export const STRETCH_PAUSE_BREAK_SEC = 10

export type TeacherStretch = {
  startSec: number
  endSec: number
  /// From the first word to the last — what the stretch took in the room.
  durationSec: number
  /// The words it opened on, so the quote and the time agree.
  opening: string
}

export function longestTeacherStretch(segments: Segment[]): TeacherStretch | null {
  let best: TeacherStretch | null = null
  let run: { startSec: number; endSec: number; opening: string } | null = null
  const close = () => {
    if (!run) return
    const durationSec = run.endSec - run.startSec
    if (!best || durationSec > best.durationSec) best = { ...run, durationSec }
    run = null
  }
  for (const segment of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    const text = segment.text.trim()
    if (segment.speakerLabel !== 'Teacher') {
      // Only an audible student turn breaks the stretch — a blank segment is
      // the transcriber, not an interruption.
      if (text) close()
      continue
    }
    if (!text) continue
    if (run && segment.startSec - run.endSec > STRETCH_PAUSE_BREAK_SEC) close()
    if (!run) run = { startSec: segment.startSec, endSec: segment.endSec, opening: text }
    else {
      run.endSec = Math.max(run.endSec, segment.endSec)
      // A stretch often opens on a fragment ("Alright. So"); a line or two
      // more is what makes the opening recognisable.
      if (run.opening.length < 120) run.opening = `${run.opening} ${text}`
    }
  }
  close()
  return best
}
