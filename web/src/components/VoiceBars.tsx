import { useEffect, useRef } from 'react'

export type VoiceBarsMode = 'idle' | 'listening' | 'thinking' | 'speaking'

const MIN_HEIGHT = 0.14
// Middle bars reach higher than the edges, the way a voice waveform looks.
const SHAPE = [0.5, 0.72, 0.9, 1, 0.9, 0.72, 0.5]

// Talk It Through's centre signal: a row of bars that behaves like a voice.
// Listening follows the teacher's real microphone level (the same number the
// mic hook already measures — nothing new is recorded). Speaking plays a
// natural, voice-like movement rather than analysing Coach's audio, which
// would mean routing playback through Web Audio and risking the iOS Safari
// audio-unlock that playback depends on. Thinking is a slow travelling wave;
// idle is a calm, nearly flat line.
//
// Bars are driven by requestAnimationFrame writing straight to the DOM, so the
// animation never re-renders React, and the loop stops entirely while idle.
export default function VoiceBars({
  mode,
  level = 0,
  className = '',
}: {
  mode: VoiceBarsMode
  level?: number
  className?: string
}) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])
  const levelRef = useRef(0)
  levelRef.current = level
  const heights = useRef<number[]>(SHAPE.map(() => MIN_HEIGHT))

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const bars = barsRef.current
    const apply = (targets: number[], ease: number) => {
      targets.forEach((target, i) => {
        const next = heights.current[i] + (target - heights.current[i]) * ease
        heights.current[i] = next
        const el = bars[i]
        if (el) el.style.transform = `scaleY(${next.toFixed(3)})`
      })
    }

    if (mode === 'idle' || reduceMotion) {
      const still = mode === 'idle' ? SHAPE.map((s) => MIN_HEIGHT + s * 0.12) : SHAPE.map((s) => 0.25 + s * 0.35)
      apply(still, 1)
      return
    }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      let targets: number[]
      if (mode === 'listening') {
        // Real input: loudness sets the height, a small per-bar wobble keeps
        // it from looking like one block moving up and down.
        const loud = Math.min(1, Math.max(0, levelRef.current) / 70)
        targets = SHAPE.map((s, i) => {
          const wobble = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7)
          return MIN_HEIGHT + (1 - MIN_HEIGHT) * s * loud * wobble
        })
      } else if (mode === 'speaking') {
        // Voice-like: syllable-rate bursts under a slower phrase envelope.
        const phrase = 0.55 + 0.45 * Math.max(0, Math.sin(t * 1.9) * 0.6 + Math.sin(t * 3.1 + 1) * 0.4)
        targets = SHAPE.map((s, i) => {
          const syllable = 0.5 + 0.5 * Math.abs(Math.sin(t * 7.3 + i * 0.9) * Math.cos(t * 4.1 + i * 1.3))
          return MIN_HEIGHT + (1 - MIN_HEIGHT) * s * phrase * syllable
        })
      } else {
        // Thinking: a gentle wave travelling across, low and unhurried.
        targets = SHAPE.map((s, i) => MIN_HEIGHT + 0.22 * s * (0.5 + 0.5 * Math.sin(t * 3.2 - i * 0.8)))
      }
      apply(targets, mode === 'listening' ? 0.35 : 0.22)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return (
    <span className={`flex h-14 items-center gap-[5px] ${className}`} aria-hidden="true">
      {SHAPE.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el
          }}
          className="block h-full w-[7px] origin-center rounded-full bg-current"
          style={{ transform: `scaleY(${MIN_HEIGHT})` }}
        />
      ))}
    </span>
  )
}
