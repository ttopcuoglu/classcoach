import { useEffect, useRef, useState } from 'react'

// A live mic-input level bar for the onboarding mic-check step — Web Audio
// API only, no recording, no data ever leaves the browser. Calls
// onSignalDetected once real audio input is observed, so the parent step
// can enable its "Yes, I can see it working" confirmation.
export default function MicLevelMeter({ onSignalDetected }: { onSignalDetected?: () => void }) {
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const hasSignaledRef = useRef(false)

  useEffect(() => {
    let audioCtx: AudioContext | null = null
    let stream: MediaStream | null = null
    let rafId = 0
    let cancelled = false

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(s)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)

        const tick = () => {
          analyser.getByteTimeDomainData(data)
          let sumSquares = 0
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128
            sumSquares += normalized * normalized
          }
          const rms = Math.sqrt(sumSquares / data.length)
          const pct = Math.min(100, Math.round(rms * 300))
          setLevel(pct)
          if (pct > 8 && !hasSignaledRef.current) {
            hasSignaledRef.current = true
            onSignalDetected?.()
          }
          rafId = requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => setError('Could not access your microphone. Check your browser/device settings and try again.'))

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      audioCtx?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return <p className="text-sm text-warm-500">{error}</p>
  }

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-canvas">
      <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${level}%` }} />
    </div>
  )
}
