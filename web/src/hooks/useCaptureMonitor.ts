import { useEffect, useRef, useState } from 'react'

// Watches what the microphone is actually picking up WHILE a lesson records,
// so a teacher learns the recording is thin in the room rather than from a
// report five days later.
//
// The problem this exists for, measured across 16 real lessons: coverage —
// the share of a recording that becomes transcribed words — ranges from 13%
// to 90%, and it is almost exactly the teacher's own talk share. A 23-minute
// lesson came through at 15%, with the first 8:23 producing no transcript at
// all, and nothing anywhere told the teacher until long afterwards.
//
// BE CLEAR ABOUT WHAT THIS CAN AND CANNOT CATCH. It measures loudness, not
// intelligibility. It reliably catches the class of failure where the phone
// is in a bag, under papers, face-down, across the room, or the mic is dead —
// the level sits at the noise floor and stays there. It will NOT catch a
// roomful of overlapping voices that is plenty loud and still transcribes to
// nothing, which is the other half of the problem. Predicting that needs
// speech recognition, not a level meter; a short live-STT sound check would
// do it and is a bigger change than this.
//
// Attaches to the MediaStream the recorder already holds. Opening a second
// getUserMedia for metering risks the browser handing back a different device
// or refusing outright, and on some phones it stops the first stream dead.

/// RMS scaled the same way MicLevelMeter does it, so "8" means the same
/// thing in both places.
const LEVEL_SCALE = 300

/// Below this the microphone is hearing room tone, not a room. Taken from
/// MicLevelMeter's own signal-detected threshold, which is the one number
/// here that has been in front of users already.
const AUDIBLE_FLOOR = 8

/// How long the level has to stay at the floor before saying anything. Long
/// enough to sit through a genuine quiet stretch — silent reading, a video,
/// students working — because crying wolf during independent work would
/// train teachers to ignore it.
const QUIET_WARNING_SEC = 60

/// Sampling interval. 10Hz is far finer than needed for a share-of-time
/// figure and keeps the bar smooth to look at.
///
/// It is a REQUEST, not a guarantee. Browsers throttle setInterval to about
/// 1Hz in a hidden or background tab, which a teacher's laptop very plausibly
/// is during a lesson. Everything below therefore accumulates elapsed
/// MILLISECONDS rather than counting ticks — an earlier version counted
/// samples, and in a background tab its one-minute quiet warning would have
/// taken ten minutes to fire. Found by watching it not fire.
const SAMPLE_MS = 100

export type CaptureMonitor = {
  /// 0-100, for the live bar.
  level: number
  /// Share of recorded time with audible sound, 0-100. Null until there is
  /// enough to say anything.
  audibleSharePct: number | null
  /// Seconds of unbroken near-silence right now.
  quietStreakSec: number
  /// The level has been at the floor long enough to be worth saying.
  warnQuiet: boolean
  /// The microphone could not be read at all — a real failure, distinct from
  /// a quiet room.
  unavailable: boolean
}

const IDLE: CaptureMonitor = {
  level: 0,
  audibleSharePct: null,
  quietStreakSec: 0,
  warnQuiet: false,
  unavailable: false,
}

export function useCaptureMonitor(stream: MediaStream | null, active: boolean): CaptureMonitor {
  const [state, setState] = useState<CaptureMonitor>(IDLE)
  // Totals survive a pause/resume, so the share describes the whole
  // recording rather than the current run. Milliseconds, not tick counts —
  // see SAMPLE_MS.
  const totalMsRef = useRef(0)
  const audibleMsRef = useRef(0)

  useEffect(() => {
    if (!active || !stream) return
    let audioCtx: AudioContext | null = null
    let timer = 0
    let quietMs = 0
    let lastTickAt = Date.now()
    // A fresh recording starts a fresh tally. Done here rather than in a
    // second effect watching `active`, which only existed to call setState
    // on the way out.
    totalMsRef.current = 0
    audibleMsRef.current = 0

    try {
      audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data)
        let sumSquares = 0
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / data.length)
        const level = Math.min(100, Math.round(rms * LEVEL_SCALE))

        // Real elapsed time since the previous tick, so a throttled interval
        // stretches the weight of each sample instead of slowing the clock.
        const now = Date.now()
        const dt = Math.min(now - lastTickAt, 5000)
        lastTickAt = now

        totalMsRef.current += dt
        if (level >= AUDIBLE_FLOOR) {
          audibleMsRef.current += dt
          quietMs = 0
        } else {
          quietMs += dt
        }
        const quietStreakSec = Math.round(quietMs / 1000)
        // Only once there is a minute of recording behind it; a share drawn
        // from the first few seconds is noise.
        const enough = totalMsRef.current >= 60 * 1000
        setState({
          level,
          audibleSharePct: enough ? Math.round((audibleMsRef.current / totalMsRef.current) * 100) : null,
          quietStreakSec,
          warnQuiet: quietStreakSec >= QUIET_WARNING_SEC,
          unavailable: false,
        })
      }, SAMPLE_MS)
    } catch {
      // Web Audio unavailable or the stream could not be tapped. Recording
      // itself must never depend on this, so fail silent-but-visible rather
      // than throwing into the recorder. This is a setState inside an effect
      // and the linter says so; it is a one-shot error path that has to
      // reach the screen, and the alternatives are worse than the warning.
      setState({ ...IDLE, unavailable: true })
    }

    return () => {
      if (timer) window.clearInterval(timer)
      // Disconnecting the source is implicit in closing the context; the
      // stream itself belongs to the recorder and is never touched here.
      void audioCtx?.close()
    }
  }, [stream, active])

  // Derived rather than stored: when nothing is recording the answer is IDLE,
  // and reaching for an effect to write that into state is how a render ends
  // up chasing itself.
  return active ? state : IDLE
}

/// Whether what was heard is thin enough to say so when the teacher stops.
/// Deliberately lower than the report's 50% coverage gate: this measures
/// audible SOUND and the report measures transcribed WORDS, and sound is
/// always the larger number. A recording can be 70% audible and still
/// transcribe to very little.
export const THIN_AUDIBLE_SHARE_PCT = 25
