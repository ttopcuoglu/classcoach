// How you brought students in — three moves in the teacher's own words, on
// one timeline. The student answers the recording heard, and which were
// followed up, are the dots on the follow-up card: drawn on the timeline too,
// their rings (from the answer pairing) sat at different times from the
// follow-up marks (from the participation read).
//
// The moves come from the participation read (server lib/participation.ts);
// lessons read before it fall back to the older invitation and revision-
// prompt reads. Answers come from the phrase scan's answerLog, and are drawn
// only where it exists. "Reached beyond volunteers" appears only with
// evidence: none heard is not none done.

import { useMemo, useState } from 'react'
import type { AudioSessionWithSegments } from '../lib/api'

type MoveType = 'invite' | 'probe' | 'voices'
type Moment = { t: number; type: MoveType; quote: string; tag: string }

const TYPES: Record<MoveType, { name: string; desc: string; tag: string; color: string; soft: string }> = {
  invite: { name: 'Invited the room in', desc: 'Asking students to share, read, or answer.', tag: 'Invitation', color: '#B8674A', soft: '#F7E6DE' },
  probe: { name: 'Asked students to say more', desc: 'Follow-ups that pushed for reasons or detail.', tag: 'Follow-up', color: '#3F7D58', soft: '#E3EFE6' },
  voices: { name: 'Reached beyond volunteers', desc: 'Brought in students who hadn’t raised a hand.', tag: 'Beyond volunteers', color: '#B88A1F', soft: '#F7EED6' },
}
const INVITE_FORMAT: Record<string, string> = {
  hands: 'Hands up',
  call_out: 'Call out',
  turn_and_talk: 'Turn and talk',
  write_first: 'Write first',
  show_me: 'Everyone shows',
  choral: 'All together',
  open: 'Open to the room',
}
const EXTEND_KIND: Record<string, string> = { probe: 'Probing', reasoning: 'Asking for reasoning', build_on_peer: 'Building on a classmate' }
/// Fewer heard answers than this and "X of Y" says more about the microphone
/// than about the teacher.
const MIN_ANSWERS_FOR_RATE = 3
const LIST_LIMIT = 4

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function Shape({ type, size = 16 }: { type: MoveType; size?: number }) {
  const c = TYPES[type].color
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="block">
      {type === 'invite' ? (
        <path d="M8 2 L15 14 H1 Z" fill={c} />
      ) : type === 'probe' ? (
        <circle cx="8" cy="8" r="6.5" fill={c} />
      ) : (
        <path d="M8 1 L15 8 L8 15 L1 8 Z" fill={c} />
      )}
    </svg>
  )
}

export default function BroughtStudentsIn({ session }: { session: AudioSessionWithSegments }) {
  const moves = session.teachingMoves
  const p = moves?.participation
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>
  const log = session.metricsLogs?.answerLog ?? detail.answerLog
  const answers = Array.isArray(log) ? (log as { timestampSec: number; followed: boolean }[]) : null
  const heard = typeof detail.answersHeardCount === 'number' ? detail.answersHeardCount : null
  const followed = typeof detail.answersFollowedUpCount === 'number' ? detail.answersFollowedUpCount : null
  const showRate = heard != null && followed != null && heard >= MIN_ANSWERS_FOR_RATE

  const moments: Moment[] = useMemo(() => {
    const invites = (p?.invitations ?? moves?.invitations ?? []).map((q) => ({
      t: q.timestampSec,
      type: 'invite' as const,
      quote: q.quote,
      tag: 'format' in q ? (INVITE_FORMAT[(q as { format: string }).format] ?? 'Invitation') : 'Invitation',
    }))
    const probes = (p?.extending ?? moves?.revisionPrompts ?? []).map((q) => ({
      t: q.timestampSec,
      type: 'probe' as const,
      quote: q.quote,
      tag: 'kind' in q ? (EXTEND_KIND[(q as { kind: string }).kind] ?? 'Follow-up') : 'Follow-up',
    }))
    const voices = (p?.widening ?? []).map((q) => ({ t: q.timestampSec, type: 'voices' as const, quote: q.quote, tag: TYPES.voices.tag }))
    return [...invites, ...probes, ...voices].sort((a, b) => a.t - b.t)
  }, [p, moves])

  const [filter, setFilter] = useState<MoveType | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [hot, setHot] = useState<number | null>(null)

  if (moments.length === 0 && !showRate) return null
  const duration = session.durationSec ?? Math.max(60, ...moments.map((m) => m.t), ...(answers ?? []).map((a) => a.timestampSec))
  const x = (sec: number) => `${Math.min(100, Math.max(0, (sec / duration) * 100)).toFixed(2)}%`
  const firstHalf = moments.filter((m) => m.t < duration / 2).length
  const types = (Object.keys(TYPES) as MoveType[]).filter((k) => k !== 'voices' || moments.some((m) => m.type === 'voices'))
  const matching = moments.map((m, i) => ({ m, i })).filter(({ m }) => !filter || m.type === filter)
  const shown = filter || expanded ? matching : matching.slice(0, LIST_LIMIT)
  const ticks = [0, 300, 600].filter((t) => t < duration - 120)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">How you brought students in</p>
      {moments.length > 0 && (
        <p className="font-heading text-xl font-bold leading-snug text-ink">
          {moments.length} move{moments.length === 1 ? '' : 's'} to bring students in —{' '}
          <span className="text-terracotta-600">
            {firstHalf} of {moments.length}
          </span>{' '}
          came in the first half.
        </p>
      )}

      {/* When it happened: your moves across the lesson. The student answers
          the recording heard are the dots on the follow-up card below. */}
      <div className="rounded-2xl border border-hairline bg-cream-card px-4 py-3.5">
        <div className="mb-2 flex justify-between text-xs font-semibold text-ink-soft">
          <span>When it happened</span>
          <span>{mmss(duration)}</span>
        </div>
        <Lane label="You">
          {moments.map((m, i) => (
            <button
              key={i}
              type="button"
              title={`${mmss(m.t)} · ${m.tag}`}
              onMouseEnter={() => setHot(i)}
              onMouseLeave={() => setHot(null)}
              onClick={() => {
                if (filter && filter !== m.type) setFilter(null)
                setExpanded(true)
                setHot(i)
              }}
              className="absolute top-1/2 transition-transform"
              style={{
                left: x(m.t),
                transform: `translate(-50%, -50%) scale(${hot === i ? 1.45 : 1})`,
                opacity: filter && filter !== m.type ? 0.18 : 1,
              }}
            >
              <Shape type={m.type} size={16} />
            </button>
          ))}
        </Lane>
        <div className="grid grid-cols-[72px_1fr] text-xs text-ink-soft">
          <span />
          <div className="relative h-4">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: x(t) }}>
                {mmss(t)}
              </span>
            ))}
            <span className="absolute right-0">{mmss(duration)}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-hairline pt-3 text-xs text-ink-soft">
          {types.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <Shape type={k} size={12} />
              {TYPES[k].tag}
            </span>
          ))}
        </div>
      </div>

      {/* The three moves, as filters. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {types.map((k) => {
          const n = moments.filter((m) => m.type === k).length
          const on = filter === k
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setFilter(on ? null : k)
                setExpanded(false)
              }}
              className="flex flex-col gap-1.5 rounded-2xl border bg-cream-card px-4 py-3.5 text-left transition-colors hover:border-[#d6ccbb]"
              style={{ borderColor: on ? TYPES[k].color : 'var(--color-hairline)', boxShadow: on ? `inset 0 0 0 1px ${TYPES[k].color}` : undefined }}
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: TYPES[k].soft }}>
                  <Shape type={k} size={14} />
                </span>
                <span className="ml-auto font-heading text-3xl font-extrabold leading-none" style={{ color: TYPES[k].color }}>
                  {n}
                </span>
              </div>
              <span className="text-sm font-semibold text-ink">{TYPES[k].name}</span>
              <span className="text-xs text-ink-soft">{TYPES[k].desc}</span>
              {k === 'probe' && showRate && (
                <>
                  {answers && answers.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {answers.map((a, i) => (
                        <i
                          key={i}
                          className="inline-block h-3 w-3 rounded-full border-2"
                          style={{ borderColor: '#3F7D58', background: a.followed ? '#3F7D58' : 'transparent' }}
                        />
                      ))}
                    </span>
                  )}
                  <span className="text-xs text-ink-soft">
                    Followed up on{' '}
                    <b className="text-ink">
                      {followed} of {heard}
                    </b>{' '}
                    student answers the recording could hear
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Every moment, in order. */}
      {moments.length > 0 && (
        <>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{filter ? `${TYPES[filter].name} · ${matching.length}` : 'Every moment, in order'}</p>
            {filter && (
              <button type="button" onClick={() => setFilter(null)} className="text-sm font-semibold text-terracotta-600">
                Show all
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-2xl border border-hairline bg-cream-card">
            {shown.map(({ m, i }, idx) => (
              <div
                key={i}
                onMouseEnter={() => setHot(i)}
                onMouseLeave={() => setHot(null)}
                className={`grid grid-cols-[48px_22px_1fr] items-start gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-hairline' : ''} ${hot === i ? 'bg-cream' : ''}`}
              >
                <span className="pt-0.5 text-sm font-semibold tabular-nums text-ink-soft">{mmss(m.t)}</span>
                <span className="pt-1">
                  <Shape type={m.type} size={14} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{m.tag}</p>
                  <p className="text-sm text-ink">“{m.quote}”</p>
                </div>
              </div>
            ))}
            {!filter && matching.length > LIST_LIMIT && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full border-t border-hairline py-3 text-sm font-semibold text-terracotta-600"
              >
                {expanded ? 'Show fewer' : `Show all ${matching.length}`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid h-10 grid-cols-[72px_1fr] items-center">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <div className="relative h-full">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-hairline" />
        {children}
      </div>
    </div>
  )
}
