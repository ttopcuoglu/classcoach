// What a teacher sees under the Talk flow timeline: where in the lesson the
// transcript has words, where the phone heard sound but no words came out of
// it, and where it was quiet. Facts only — never why. The teacher was in the
// room and can read "18:00–22:00, sound but no words" as "I was at the back
// table" far better than anything here could guess it.

import { classifySeconds, type LevelTrace, type SpeechInterval, teacherIntervals } from './settleTime.ts'

export type SoundTimeline = {
  /// One character per second: w words, q quiet, s sound with no words, - no reading.
  seconds: string
  wordsSec: number
  soundSec: number
  quietSec: number
  /// The longest stretches of sound with no words, in lesson order. Only
  /// stretches of a minute or more — anything shorter is a pause between
  /// sentences, not something a teacher can place.
  soundRuns: { startSec: number; endSec: number }[]
}

/// A stretch of sound survives a few seconds of words or quiet inside it —
/// one transcribed "okay" in the middle of four lost minutes is still four
/// lost minutes to the teacher reading it.
const RUN_GAP_SEC = 5
const MIN_RUN_SEC = 60
const MAX_RUNS = 3

export function soundRuns(seconds: string): { startSec: number; endSec: number }[] {
  const runs: { startSec: number; endSec: number }[] = []
  let start = -1
  let lastSound = -1
  for (let i = 0; i <= seconds.length; i++) {
    const isSound = seconds[i] === 's'
    if (isSound) {
      if (start < 0) start = i
      lastSound = i
    } else if (start >= 0 && (i - lastSound > RUN_GAP_SEC || i === seconds.length)) {
      runs.push({ startSec: start, endSec: lastSound + 1 })
      start = -1
    }
  }
  return runs
    .filter((r) => r.endSec - r.startSec >= MIN_RUN_SEC)
    .sort((a, b) => b.endSec - b.startSec - (a.endSec - a.startSec))
    .slice(0, MAX_RUNS)
    .sort((a, b) => a.startSec - b.startSec)
}

export function buildSoundTimeline(
  trace: LevelTrace | null,
  segments: { speakerLabel: string; startSec: number; endSec: number }[],
  durationSec: number | null,
): SoundTimeline | null {
  if (!trace || !durationSec || durationSec <= 0) return null
  const anySpeech: SpeechInterval[] = segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec }))
  const seconds = classifySeconds(trace, teacherIntervals(segments), durationSec, anySpeech)
  if (seconds == null) return null
  let wordsSec = 0
  let soundSec = 0
  let quietSec = 0
  for (const c of seconds) {
    if (c === 'w') wordsSec++
    else if (c === 's') soundSec++
    else if (c === 'q') quietSec++
  }
  return { seconds, wordsSec, soundSec, quietSec, soundRuns: soundRuns(seconds) }
}
