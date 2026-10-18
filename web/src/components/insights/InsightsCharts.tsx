// The three charts on the Insights page, and only these three. Each draws
// exactly what the model holds: a block is a line that exists, a square is a
// question that was counted.

import { mmss, type DirectionRow, type QuestionSquare, type TimelineModel } from '../../lib/insightsModel'
import { HatchedSwatch } from '../unavailableChart'

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

/// Your lesson, minute by minute: when you spoke, where you sped up, and the
/// moments you opened the floor or checked. Everything that was not your
/// speech is the hatched ground it sits on.
export function LessonTimeline({ model }: { model: TimelineModel }) {
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / model.durationSec) * W))
  return (
    <ChartFrame title="Your lesson, minute by minute" aside={mmss(model.durationSec)}>
      <svg viewBox={`0 0 ${W} 84`} width="100%" role="img" aria-label="When you spoke across the lesson">
        <defs>
          <pattern id="insights-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-canvas)" />
            <rect width="2" height="6" fill="var(--color-border)" />
          </pattern>
        </defs>
        <rect x="0" y="34" width={W} height="22" rx="6" fill="url(#insights-hatch)" />
        {model.speech.map((s, i) => (
          <rect key={i} x={x(s.startSec)} y="34" width={Math.max(1, x(s.endSec) - x(s.startSec))} height="22" fill="var(--color-forest-soft)" />
        ))}
        {model.fast.map((s, i) => (
          <rect key={`f${i}`} x={x(s.startSec)} y="34" width={Math.max(2, x(s.endSec) - x(s.startSec))} height="22" fill="var(--color-terracotta)">
            <title>{`${mmss(s.startSec)} · ${s.wpm} words a minute`}</title>
          </rect>
        ))}
        {model.invitations.map((t, i) => (
          <circle key={`i${i}`} cx={x(t)} cy="18" r="7" fill="#8A7BC0">
            <title>{`${mmss(t)} · you opened the floor`}</title>
          </circle>
        ))}
        {model.checks.map((t, i) => (
          <circle key={`c${i}`} cx={x(t)} cy="18" r="6" fill="none" stroke="var(--color-forest-soft)" strokeWidth="3">
            <title>{`${mmss(t)} · a spoken check`}</title>
          </circle>
        ))}
        <text x="0" y="78" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="78" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(model.durationSec)}</text>
      </svg>
      <Key>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-forest-soft align-[-1px]" />You speaking</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-terracotta align-[-1px]" />Fast stretch</span>
        <span className="flex items-center gap-1.5"><HatchedSwatch className="h-2.5 w-2.5 rounded-sm" />Not your speech</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-[#8A7BC0] align-[-1px]" />Invitation</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-forest-soft align-[-1px]" />Spoken check</span>
      </Key>
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
