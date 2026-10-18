// The charts on the Insights page. Each draws
// exactly what the model holds: a block is a line that exists, a square is a
// question that was counted.

import { useState } from 'react'
import { HATCH_STYLE } from '../../lib/chartPatterns'
import { mmss, type DirectionRow, type QuestionSquare, type TimelineModel } from '../../lib/insightsModel'
import type { FlowKind, FlowModel, PacePoint } from '../../lib/talkFlow'
import { HatchedSwatch } from '../unavailableChart'
import { FAST_COLOR, FLOW_COLOR, FLOW_LABEL } from './flowColors'

function ChartFrame({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5 rounded-2xl bg-cream px-4 py-3.5">
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-[12px] font-bold text-ink-soft">
        <span>{title}</span>
        {aside && <span>{aside}</span>}
      </div>
      {children}
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-soft">{children}</div>
}

const W = 600

/// Your recording, minute by minute: the share of it that was you, other
/// voices, sound with no words, and quiet; the same as a strip across the
/// lesson; where you opened the floor or checked; and where you sped up.
export function TalkFlowChart({ flow, timeline }: { flow: FlowModel; timeline: TimelineModel | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const kinds: FlowKind[] = flow.hasEnvelope ? ['you', 'other', 'sound', 'quiet', 'unknown'] : ['you', 'other', 'unknown']
  const shown = kinds.filter((k) => flow.shares[k] >= 0.5)
  const duration = flow.bins.length * flow.binSec
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / duration) * W))
  const binW = W / flow.bins.length
  const label = (k: FlowKind) => (k === 'unknown' && !flow.hasEnvelope ? 'No words' : FLOW_LABEL[k])
  const swatch = (k: FlowKind) =>
    k === 'unknown' ? <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> : <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FLOW_COLOR[k] }} />
  return (
    <ChartFrame title="Your recording, minute by minute" aside={mmss(duration)}>
      {/* The share of the whole recording. */}
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={shown.map((k) => `${label(k)} ${Math.round(flow.shares[k])}%`).join(', ')}>
        {shown.map((k) => (
          <div
            key={k}
            title={`${label(k)}: ${Math.round(flow.shares[k])}%`}
            className="h-full"
            style={{ width: `${flow.shares[k]}%`, ...(k === 'unknown' ? HATCH_STYLE : { background: FLOW_COLOR[k] }) }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink">
        {shown.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            {swatch(k)} {label(k)} <b>{Math.round(flow.shares[k])}%</b>
          </span>
        ))}
      </div>

      {/* The same, across the lesson. */}
      <svg viewBox={`0 0 ${W} 62`} width="100%" className="mt-3" role="img" aria-label="What the recording held, across the lesson" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="flow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-canvas)" />
            <rect width="2" height="6" fill="var(--color-border)" />
          </pattern>
        </defs>
        {flow.bins.map((k, i) => (
          <rect
            key={i}
            x={i * binW}
            y="18"
            width={Math.max(0.5, binW - 1)}
            height="22"
            fill={k === 'unknown' ? 'url(#flow-hatch)' : FLOW_COLOR[k]}
            opacity={hover == null || hover === i ? 1 : 0.55}
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {timeline?.fast.map((f, i) => (
          <rect key={`f${i}`} x={x(f.startSec)} y="43" width={Math.max(3, x(f.endSec) - x(f.startSec))} height="4" rx="2" fill={FAST_COLOR}>
            <title>{`${mmss(f.startSec)} · ${f.wpm} words a minute`}</title>
          </rect>
        ))}
        {timeline?.invitations.map((t, i) => (
          <path key={`i${i}`} d={`M ${x(t)} 4 l 5 9 l -10 0 z`} fill="var(--color-forest)">
            <title>{`${mmss(t)} · you opened the floor`}</title>
          </path>
        ))}
        {timeline?.checks.map((t, i) => (
          <circle key={`c${i}`} cx={x(t)} cy="9" r="4.5" fill="none" stroke="var(--color-forest)" strokeWidth="2">
            <title>{`${mmss(t)} · a spoken check`}</title>
          </circle>
        ))}
        <text x="0" y="60" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="60" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(duration)}</text>
      </svg>
      <p className="m-0 h-4 text-[12px] text-ink-soft" aria-live="polite">
        {hover != null &&
          `${mmss(hover * flow.binSec)}–${mmss((hover + 1) * flow.binSec)} · mostly ${label(flow.bins[hover]).toLowerCase()}`}
      </p>
      <Key>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true"><path d="M 5 0 l 5 9 l -10 0 z" fill="var(--color-forest)" /></svg>Invitation
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--color-forest)" strokeWidth="2" /></svg>Spoken check
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-1 w-3 rounded" style={{ background: FAST_COLOR }} />Fast stretch
        </span>
      </Key>
      <p className="mb-0 mt-1.5 text-[11.5px] text-ink-soft">
        “Other voices” is speech the transcript didn’t attribute to you — usually students, but this report doesn’t
        tell voices apart, so it may include you.
        {flow.hasEnvelope ? ' “Sound, no words” is sound the microphone caught but couldn’t turn into words.' : ''}
      </p>
    </ChartFrame>
  )
}

const PACE_H = 150
const PACE_TOP = 10
const PACE_BOTTOM = 22

/// Your words a minute, minute by minute, against everyday conversation (150)
/// and the fast-stretch line (180). A minute with too little of your speech
/// has no point rather than a made-up one.
export function PaceChart({ pace, average }: { pace: PacePoint[]; average: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const measured = pace.filter((p) => p.wpm != null) as (PacePoint & { wpm: number })[]
  if (measured.length < 2) return null
  const duration = pace[pace.length - 1].endSec
  const values = measured.map((p) => p.wpm)
  // The range your minutes actually span, with both reference lines inside
  // it — a scale from zero left every point crowded at the top.
  const top = Math.max(200, Math.ceil((Math.max(...values) + 15) / 20) * 20)
  const bottom = Math.max(0, Math.min(120, Math.floor((Math.min(...values) - 20) / 20) * 20))
  const x = (sec: number) => (sec / duration) * W
  const y = (wpm: number) => PACE_TOP + (1 - (wpm - bottom) / (top - bottom)) * (PACE_H - PACE_TOP - PACE_BOTTOM)
  const mid = (p: PacePoint) => (p.startSec + p.endSec) / 2
  // Break the line wherever a minute had no pace.
  const runs: (PacePoint & { wpm: number })[][] = []
  for (const p of pace) {
    if (p.wpm == null) runs.push([])
    else {
      if (runs.length === 0) runs.push([])
      runs[runs.length - 1].push(p as PacePoint & { wpm: number })
    }
  }
  const hovered = hover != null ? pace[hover] : null
  return (
    <ChartFrame title="Your pace, minute by minute" aside={average ? `${average} words a minute on average` : undefined}>
      <svg viewBox={`0 0 ${W} ${PACE_H}`} width="100%" role="img" aria-label="Your words a minute across the lesson" onMouseLeave={() => setHover(null)}>
        {[150, 180].map((ref) => (
          <g key={ref}>
            <line x1="0" x2={W} y1={y(ref)} y2={y(ref)} stroke={ref === 180 ? FAST_COLOR : 'var(--color-ink-soft)'} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
            {/* Left, one above its line and one below, so the two never meet. */}
            <text x="4" y={ref === 180 ? y(ref) - 4 : y(ref) + 12} fontSize="10.5" fill="var(--color-ink-soft)">
              {ref === 180 ? '180 · fast' : '150 · everyday conversation'}
            </text>
          </g>
        ))}
        {runs.filter((r) => r.length > 0).map((r, i) => (
          <polyline key={i} points={r.map((p) => `${x(mid(p))},${y(p.wpm)}`).join(' ')} fill="none" stroke={FLOW_COLOR.you} strokeWidth="2" strokeLinejoin="round" />
        ))}
        {hovered && <line x1={x(mid(hovered))} x2={x(mid(hovered))} y1={PACE_TOP} y2={PACE_H - PACE_BOTTOM} stroke="var(--color-ink-soft)" strokeWidth="1" />}
        {measured.map((p) => (
          <circle key={p.startSec} cx={x(mid(p))} cy={y(p.wpm)} r="4" fill={p.wpm > 180 ? FAST_COLOR : FLOW_COLOR.you} stroke="var(--color-cream)" strokeWidth="2" />
        ))}
        {/* Hit areas wider than the marks: one per minute. */}
        {pace.map((p, i) => (
          <rect key={`h${i}`} x={x(p.startSec)} y="0" width={Math.max(1, x(p.endSec) - x(p.startSec))} height={PACE_H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        <text x="0" y={PACE_H - 6} fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y={PACE_H - 6} fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(duration)}</text>
        <text x={W} y={PACE_TOP + 8} fontSize="10" textAnchor="end" fill="var(--color-ink-soft)">{top} wpm</text>
        <text x={W} y={PACE_H - PACE_BOTTOM - 3} fontSize="10" textAnchor="end" fill="var(--color-ink-soft)">{bottom} wpm</text>
      </svg>
      <p className="m-0 h-4 text-[12px] text-ink-soft" aria-live="polite">
        {hovered &&
          `${mmss(hovered.startSec)}–${mmss(hovered.endSec)} · ${hovered.wpm != null ? `${hovered.wpm} words a minute` : 'too little of your speech to time'}`}
      </p>
      <p className="mb-0 mt-1 text-[11.5px] text-ink-soft">
        Words a minute of your own speaking time. A minute with under 15 seconds of your speech has no point. An
        anchor to place yourself against, not a target.
      </p>
    </ChartFrame>
  )
}

/// One square per question, in the order asked.
export function QuestionSquares({ squares }: { squares: QuestionSquare[] }) {
  const higher = squares.filter((s) => s.higherOrder).length
  const answered = squares.filter((s) => s.selfAnswered).length
  return (
    <ChartFrame title={`Your ${squares.length} question${squares.length === 1 ? '' : 's'}, in order`}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(22px,1fr))] gap-1.5">
        {squares.map((s) => (
          <i
            key={s.timestampSec}
            title={`${mmss(s.timestampSec)} · ${s.higherOrder ? 'higher-order' : 'recall'}${s.selfAnswered ? ' · you answered it' : ''}`}
            className={`relative block aspect-square rounded-[5px] ${s.higherOrder ? 'bg-forest' : 'bg-[#B8C9BC]'}`}
          >
            {s.selfAnswered && <span className="absolute left-1/3 top-1/3 h-1/3 w-1/3 rounded-full bg-white" />}
          </i>
        ))}
      </div>
      <Key>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#B8C9BC] align-[-1px]" />Recall {squares.length - higher}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-forest align-[-1px]" />Higher-order {higher}</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-[3px] border-[#B8C9BC] bg-white align-[-1px]" />You answered it {answered}</span>
      </Key>
    </ChartFrame>
  )
}

const PARTS = ['task', 'steps', 'time', 'product'] as const

/// One row per set of directions; a filled cell is a part it named.
export function DirectionsGrid({ rows }: { rows: DirectionRow[] }) {
  return (
    <ChartFrame title={`Your ${rows.length} set${rows.length === 1 ? '' : 's'} of directions`}>
      <div className="grid grid-cols-[46px_repeat(4,1fr)] items-center gap-1.5 text-[11.5px]">
        <span />
        {['Task', 'Steps', 'Time', 'Product'].map((h) => (
          <span key={h} className="text-center font-bold text-ink-soft">{h}</span>
        ))}
        {rows.map((r) => (
          <DirectionLine key={r.timestampSec} row={r} />
        ))}
      </div>
    </ChartFrame>
  )
}

function DirectionLine({ row }: { row: DirectionRow }) {
  return (
    <>
      <span className="font-mono text-[11px] font-bold text-forest">{mmss(row.timestampSec)}</span>
      {PARTS.map((p) => (
        <i
          key={p}
          aria-label={`${p} ${row.parts.includes(p) ? 'named' : 'not named'}`}
          className={`block h-[22px] rounded-[5px] ${row.parts.includes(p) ? 'bg-forest-soft' : 'border-2 border-[#D8CDB4] bg-cream-card'}`}
        />
      ))}
    </>
  )
}
