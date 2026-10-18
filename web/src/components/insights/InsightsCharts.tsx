// The charts on the Insights page. Each draws
// exactly what the model holds: a block is a line that exists, a square is a
// question that was counted.

import { useState } from 'react'
import { mmss, type DirectionRow, type QuestionSquare, type TimelineModel } from '../../lib/insightsModel'

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
/// lesson; and where you opened the floor or checked.
/// Your speech, in the green validated for the Talk & Pace palette (light,
/// on the cream surface).
const YOU_COLOR = '#2F855A'

/// When you spoke, across the lesson: your speech in green on the whole
/// recording, with a mark where you opened the floor. Nothing else — what
/// the rest of the recording held is not this report's to say.
export function SpeechTimeline({ timeline }: { timeline: TimelineModel }) {
  const [hover, setHover] = useState<number | null>(null)
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / timeline.durationSec) * W))
  return (
    <ChartFrame title="When you spoke" aside={mmss(timeline.durationSec)}>
      <svg viewBox={`0 0 ${W} 44`} width="100%" role="img" aria-label="Your speech across the lesson, with the moments you opened the floor">
        <rect x="0" y="16" width={W} height="16" rx="5" fill="var(--color-hairline)" />
        {timeline.speech.map((s, i) => (
          <rect key={i} x={x(s.startSec)} y="16" width={Math.max(1, x(s.endSec) - x(s.startSec))} height="16" fill={YOU_COLOR} />
        ))}
        {timeline.invitations.map((t, i) => (
          <path
            key={`i${i}`}
            d={`M ${x(t)} 2 l 6 10 l -12 0 z`}
            fill="var(--color-terracotta)"
            opacity={hover == null || hover === i ? 1 : 0.5}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${mmss(t)} · you opened the floor`}</title>
          </path>
        ))}
        <text x="0" y="43" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="43" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(timeline.durationSec)}</text>
      </svg>
      <Key>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ background: YOU_COLOR }} />You</span>
        {timeline.invitations.length > 0 && (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true"><path d="M 5 0 l 5 9 l -10 0 z" fill="var(--color-terracotta)" /></svg>You opened the floor
          </span>
        )}
      </Key>
    </ChartFrame>
  )
}

/// The three numbers Talk & Pace leads with.
export function TalkNumbers({ talkPct, wpm, stretch }: { talkPct: number | null; wpm: number | null; stretch: { durationSec: number; startSec: number } | null }) {
  const tile = (label: string, value: string, sub: string) => (
    <div className="rounded-xl bg-cream px-3.5 py-3">
      <p className="m-0 text-[12px] font-bold text-ink-soft">{label}</p>
      <p className="m-0 font-heading text-2xl font-extrabold leading-tight text-ink">{value}</p>
      <p className="m-0 text-[12px] text-ink-soft">{sub}</p>
    </div>
  )
  return (
    <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {tile('You spoke', talkPct != null ? `${Math.round(talkPct)}%` : '—', talkPct != null ? 'of the recording' : 'not measured')}
      {tile('Your pace', wpm != null ? String(Math.round(wpm)) : '—', wpm != null ? 'words a minute · conversation runs about 150' : 'not measured')}
      {tile('Longest stretch', stretch ? mmss(stretch.durationSec) : '—', stretch ? `starting at ${mmss(stretch.startSec)}` : 'not measured')}
    </div>
  )
}

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
