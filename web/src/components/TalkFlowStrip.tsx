// The lesson minute by minute: one block per slice of the recording, coloured
// by what most of it was, with a mark where the teacher opened the floor and
// where they checked for understanding.
//
// The share bar on top uses the report's stored split (you and students as
// the tiles state them; the rest divided into quiet and sound with no words
// by the envelope), so the chart and the tiles never disagree. The strip
// below is the same recording slice by slice.

import { useState } from 'react'
import { buildFlow, type FlowKind } from '../lib/talkFlow'
import type { TranscriptSegment } from '../lib/api'
import { HATCH_STYLE } from '../lib/chartPatterns'
import { HatchedBar, HatchedSwatch } from './unavailableChart'

const W = 600

/// Validated (dataviz validate_palette.js, light, on the cream surface):
/// lightness band, chroma floor, colour-blind and normal-vision separation.
/// Amber and blue sit under 3:1 against the surface, so every slot is shown
/// with a visible label and percentage.
export const FLOW_COLOR: Record<Exclude<FlowKind, 'unknown'>, string> = {
  you: '#2F855A',
  other: '#8B7BC2',
  sound: '#D08A2A',
  quiet: '#3F8FD8',
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

export type ShareSlice = { kind: FlowKind; pct: number }

export default function TalkFlowStrip({
  segments,
  durationSec,
  seconds,
  invitations,
  checks,
  shares,
}: {
  segments: TranscriptSegment[]
  durationSec: number | null
  /// The loudness envelope, one character a second; absent on older recordings.
  seconds?: string | null
  invitations: number[]
  checks: number[]
  /// The whole recording's split, as the report states it.
  shares: ShareSlice[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const flow = durationSec ? buildFlow(segments, durationSec, seconds ?? null) : null
  if (!flow || segments.length === 0) return <HatchedBar label="Talk flow unavailable this session." className="h-6 rounded-lg" />
  const duration = flow.bins.length * flow.binSec
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / duration) * W))
  const binW = W / flow.bins.length
  const label = (k: FlowKind) => (k === 'unknown' && !flow.hasEnvelope ? 'No words' : LABEL[k])
  const slices = shares.filter((s) => s.pct >= 0.5)
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-cream-card px-4 py-3.5">
      <div className="flex justify-between text-xs font-bold text-ink-soft">
        <span>Your recording, minute by minute</span>
        <span>{mmss(duration)}</span>
      </div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={slices.map((s) => `${label(s.kind)} ${Math.round(s.pct)}%`).join(', ')}>
        {slices.map((s) => (
          <div
            key={s.kind}
            title={`${label(s.kind)}: ${Math.round(s.pct)}%`}
            className="h-full"
            style={{ width: `${s.pct}%`, background: s.kind === 'unknown' ? undefined : FLOW_COLOR[s.kind], ...(s.kind === 'unknown' ? HATCH_STYLE : {}) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink">
        {slices.map((s) => (
          <span key={s.kind} className="flex items-center gap-1.5">
            {s.kind === 'unknown' ? <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> : <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: FLOW_COLOR[s.kind] }} />}
            {label(s.kind)} <b>{Math.round(s.pct)}%</b>
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} 78`} width="100%" role="img" aria-label="What the recording held, across the lesson" onMouseLeave={() => setHover(null)}>
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
            height="40"
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
        <text x="0" y="76" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="76" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(duration)}</text>
      </svg>
      <p className="m-0 h-4 text-xs text-ink-soft" aria-live="polite">
        {hover != null && `${mmss(hover * flow.binSec)}–${mmss((hover + 1) * flow.binSec)} · mostly ${label(flow.bins[hover]).toLowerCase()}`}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
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
      <p className="text-xs text-ink-soft">
        {flow.hasEnvelope && '“Sound, no words” is sound the microphone caught but couldn’t turn into words. '}
        “Students” is speech the transcript didn’t attribute to you — a student close to you can be heard as you, and you as them.
      </p>
    </div>
  )
}
