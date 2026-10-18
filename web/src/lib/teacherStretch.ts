// The longest stretch of unbroken teacher talk. Mirrors
// server/src/lib/teacherStretch.ts, which has the reasoning: a stretch ends
// when a student is heard OR the teacher pauses for longer than a breath, so a
// video, a hand-out or a quiet room is no longer counted as talking.
//
// Computed here from the transcript the report already holds, rather than
// read from the stored highlight, so reports analyzed before the measure was
// corrected show the corrected one too.

export const STRETCH_PAUSE_BREAK_SEC = 10
/// Shorter than this is not a "long stretch" of anything, and is not shown.
export const MIN_STRETCH_TO_SHOW_SEC = 120

export type TeacherStretch = { startSec: number; endSec: number; durationSec: number; opening: string }

type Seg = { speakerLabel: string; startSec: number; endSec: number; text: string }

export function longestTeacherStretch(segments: Seg[]): TeacherStretch | null {
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
      if (text) close()
      continue
    }
    if (!text) continue
    if (run && segment.startSec - run.endSec > STRETCH_PAUSE_BREAK_SEC) close()
    if (!run) run = { startSec: segment.startSec, endSec: segment.endSec, opening: text }
    else {
      run.endSec = Math.max(run.endSec, segment.endSec)
      if (run.opening.length < 120) run.opening = `${run.opening} ${text}`
    }
  }
  close()
  return best
}
