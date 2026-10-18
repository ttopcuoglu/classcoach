// The lesson minute by minute: one block per slice of the recording, coloured
// by what most of it was, with a mark where the teacher opened the floor and
// where they checked for understanding.
//
// No percentages here: the bar at the top of Talk & Participation states the
// split, and two charts stating it two ways is how a page ends up with two
// numbers for one thing.

import { useState } from 'react'
import { buildFlow, type FlowKind } from '../lib/talkFlow'
import type { TranscriptSegment } from '../lib/api'
import { HatchedBar, HatchedSwatch } from './unavailableChart'

const W = 600

/// The bar above uses terracotta for you and gold for students; the strip
/// keeps to them, so one colour means one thing on the page.
const FLOW_COLOR: Record<Exclude<FlowKind, 'unknown'>, string> = {
  you: 'var(--color-terracotta)',
  other: 'var(--color-gold)',
  sound: '#8B7BC2',
  quiet: 'var(--color-hairline)',
}

const LABEL: Record<FlowKind, string> = {
  you: 'You',
  other: 'Students',
  sound: 'Sound, no words',
  quiet: 'Quiet',
  unknown: 'No reading',
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export default function TalkFlowStrip({
  segments,
  durationSec,
  seconds,
  invitations,
  checks,
}: {
  segments: TranscriptSegment[]
  durationSec: number | null
  /// The loudness envelope, one character a second; absent on older recordings.
  seconds?: string | null
  invitations: number[]
  checks: number[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const flow = durationSec ? buildFlow(segments, durationSec, seconds ?? null) : null
  if (!flow || segments.length === 0) return <HatchedBar label="Talk flow unavailable this session." className="h-6 rounded-lg" />
  const duration = flow.bins.length * flow.binSec
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / duration) * W))
  const binW = W / flow.bins.length
  const kinds: FlowKind[] = flow.hasEnvelope ? ['you', 'other', 'sound', 'quiet', 'unknown'] : ['you', 'other', 'unknown']
  const shown = kinds.filter((k) => flow.bins.includes(k))
  const label = (k: FlowKind) => (k === 'unknown' && !flow.hasEnvelope ? 'No words' : LABEL[k])
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} 62`} width="100%" role="img" aria-label="What the recording held, across the lesson" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="flow-strip-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-cream)" />
            <rect width="2" height="6" fill="var(--color-hairline)" />
          </pattern>
        </defs>
        {flow.bins.map((k, i) => (
          <rect
            key={i}
            x={i * binW}
            y="18"
            width={Math.max(0.5, binW - 1)}
            height="22"
            fill={k === 'unknown' ? 'url(#flow-strip-hatch)' : FLOW_COLOR[k]}
            opacity={hover == null || hover === i ? 1 : 0.55}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {invitations.map((t, i) => (
          <path key={`i${i}`} d={`M ${x(t)} 4 l 5 9 l -10 0 z`} fill="var(--color-forest)">
            <title>{`${mmss(t)} · you opened the floor`}</title>
          </path>
        ))}
        {checks.map((t, i) => (
          <circle key={`c${i}`} cx={x(t)} cy="9" r="4.5" fill="none" stroke="var(--color-forest)" strokeWidth="2">
            <title>{`${mmss(t)} · a check for understanding`}</title>
          </circle>
        ))}
        <text x="0" y="60" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="60" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(duration)}</text>
      </svg>
      <p className="m-0 h-4 text-xs text-ink-soft" aria-live="polite">
        {hover != null && `${mmss(hover * flow.binSec)}–${mmss((hover + 1) * flow.binSec)} · mostly ${label(flow.bins[hover]).toLowerCase()}`}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {shown.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            {k === 'unknown' ? <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> : <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FLOW_COLOR[k] }} />}
            {label(k)}
          </span>
        ))}
        {invitations.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true"><path d="M 5 0 l 5 9 l -10 0 z" fill="var(--color-forest)" /></svg>You opened the floor
          </span>
        )}
        {checks.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--color-forest)" strokeWidth="2" /></svg>Check for understanding
          </span>
        )}
      </div>
      {flow.hasEnvelope && (
        <p className="text-xs text-ink-soft">“Sound, no words” is sound the microphone caught but couldn’t turn into words.</p>
      )}
    </div>
  )
}
