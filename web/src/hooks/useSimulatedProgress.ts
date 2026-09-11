import { useEffect, useState } from 'react'

// There is no real "% done" signal from Claude (or from Deepgram's batch
// transcription) — nothing streams a completion fraction back. So this is an
// honest estimate, not a measurement: it climbs quickly at first, eases off,
// and asymptotically approaches but never reaches CEILING on its own. It only
// ever reaches 100% implicitly, by disappearing the instant the real response
// arrives and the caller flips `active` to false.
//
// Same technique already used by TalkToMe's thinkingProgress and the audio
// upload bar, extracted here so every "Wivoza is working" state shares one
// curve rather than each inventing its own.
const CEILING = 92

export function useSimulatedProgress(active: boolean, estimatedMs = 6000): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) {
      setProgress(0)
      return
    }
    // Guard against a caller passing 0/NaN and producing an instant 92%.
    const tau = Math.max(1200, estimatedMs)
    const start = Date.now()
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - start
      setProgress(CEILING * (1 - Math.exp(-elapsed / tau)))
    }, 100)
    return () => window.clearInterval(interval)
  }, [active, estimatedMs])

  return progress
}
