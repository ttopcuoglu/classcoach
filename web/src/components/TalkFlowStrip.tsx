// The lesson minute by minute: one block per slice of the recording, coloured
// by what most of it was, with a mark where the teacher opened the floor and
// where they checked for understanding.
//
// The share bar on top uses the report's stored split (you and students as
// the tiles state them; the rest divided into quiet and sound with no words
// by the envelope), so the chart and the tiles never disagree. The strip
// below is the same recording slice by slice.
//
// A lesson that carries the server's per-second breakdown (roomBreakdown.ts)
// is drawn from that instead: teacher voice, student voice, a tagged video or
// audio, group voice and quiet time, for the bar, the strip and the tiles.

import { useState } from 'react'
import { buildFlow, type FlowKind } from '../lib/talkFlow'
import type { TranscriptSegment } from '../lib/api'
import type { RoomBreakdown, RoomKind } from '../lib/roomBreakdown'
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

export const ROOM_COLOR: Record<RoomKind, string> = {
  teacher: FLOW_COLOR.you,
  student: FLOW_COLOR.other,
  video: '#C2577F',
  other: FLOW_COLOR.sound,
  quiet: FLOW_COLOR.quiet,
}

export const ROOM_LABEL: Record<RoomKind, string> = {
  teacher: 'Teacher Voice',
  student: 'Student Voice',
  video: 'Video/Audio',
  other: 'Group Voice',
  quiet: 'Quiet Time',
}

const ROOM_ORDER: RoomKind[] = ['teacher', 'student', 'video', 'other', 'quiet']

/// What the bar, legend and strip draw, from whichever split the lesson has.
type View = {
  slices: { key: string; pct: number }[]
  bins: (string | null)[]
  binSec: number
  color: (key: string | null) => string | undefined
  label: (key: string | null) => string
  hatched: (key: string | null) => boolean
}

const MAX_BINS = 120

function roomView(room: RoomBreakdown): View {
  const total = room.seconds.length
  const binCount = Math.min(MAX_BINS, total)
  const binSec = total / binCount
  const bins: (RoomKind | null)[] = []
  for (let b = 0; b < binCount; b++) {
    const tally = new Map<RoomKind, number>()
    for (let sec = Math.floor(b * binSec); sec < Math.min(total, Math.floor((b + 1) * binSec) || 1); sec++) {
      const k = room.seconds[sec]
      if (k) tally.set(k, (tally.get(k) ?? 0) + 1)
    }
    // The teacher's and students' words win a tie, as on the older strip.
    bins.push(ROOM_ORDER.reduce<RoomKind | null>((best, k) => ((tally.get(k) ?? 0) > (best ? (tally.get(best) ?? 0) : 0) ? k : best), null))
  }
  return {
    slices: ROOM_ORDER.map((k) => ({ key: k, pct: room.pct[k] })),
    bins,
    binSec,
    color: (k) => (k ? ROOM_COLOR[k as RoomKind] : undefined),
    label: (k) => (k ? ROOM_LABEL[k as RoomKind] : 'No reading'),
    hatched: (k) => k == null,
  }
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

/// What the strip can mark above itself: invitations, follow-ups, reaching
/// beyond volunteers, and checks for understanding.
export type StripMark = { t: number; kind: 'invite' | 'probe' | 'voices' | 'check' }
const MARK: Record<StripMark['kind'], { label: string; color: string }> = {
  invite: { label: 'Invitations to participate', color: '#B8674A' },
  probe: { label: 'Follow-ups that pushed students further', color: '#3F7D58' },
  voices: { label: 'Reaching beyond volunteers', color: '#B88A1F' },
  check: { label: 'Check for understanding', color: 'var(--color-forest)' },
}

function MarkShape({ kind, x, y, size }: { kind: StripMark['kind']; x: number; y: number; size: number }) {
  const h = size / 2
  const c = MARK[kind].color
  if (kind === 'invite') return <path d={`M ${x} ${y - h} L ${x + h} ${y + h} L ${x - h} ${y + h} Z`} fill={c} />
  if (kind === 'probe') return <circle cx={x} cy={y} r={h} fill={c} />
  if (kind === 'voices') return <path d={`M ${x} ${y - h} L ${x + h} ${y} L ${x} ${y + h} L ${x - h} ${y} Z`} fill={c} />
  return <circle cx={x} cy={y} r={h - 1} fill="none" stroke={c} strokeWidth="2" />
}

export default function TalkFlowStrip({
  segments,
  durationSec,
  seconds,
  marks,
  shares,
  room,
  onPick,
}: {
  segments: TranscriptSegment[]
  durationSec: number | null
  /// The loudness envelope, one character a second; absent on older recordings.
  seconds?: string | null
  marks: StripMark[]
  /// The whole recording's split, as the report states it.
  shares: ShareSlice[]
  /// The server's per-second breakdown, when the lesson has one.
  room?: RoomBreakdown | null
  /// A Teacher Voice or Student Voice block or legend entry was clicked: show
  /// what was said there. The others had no words to show.
  onPick?: (pick: { kind: 'teacher' | 'student' } | { startSec: number; endSec: number }) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const flow = durationSec ? buildFlow(segments, durationSec, seconds ?? null) : null
  const view: View | null = room
    ? roomView(room)
    : flow
      ? {
          slices: shares.map((s) => ({ key: s.kind, pct: s.pct })),
          bins: flow.bins,
          binSec: flow.binSec,
          color: (k) => (k == null || k === 'unknown' ? undefined : FLOW_COLOR[k as Exclude<FlowKind, 'unknown'>]),
          label: (k) => (k === 'unknown' && !flow.hasEnvelope ? 'No words' : LABEL[(k ?? 'unknown') as FlowKind]),
          hatched: (k) => k == null || k === 'unknown',
        }
      : null
  if (!view || segments.length === 0) return <HatchedBar label="Talk flow unavailable this session." className="h-6 rounded-lg" />
  const duration = view.bins.length * view.binSec
  const x = (sec: number) => Math.min(W, Math.max(0, (sec / duration) * W))
  const binW = W / view.bins.length
  const label = view.label
  const slices = view.slices.filter((s) => s.pct >= 0.5)
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-cream px-4 py-3.5">
      <div className="flex justify-between text-xs font-bold text-ink-soft">
        <span>Your recording, minute by minute</span>
        <span>{mmss(duration)}</span>
      </div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={slices.map((s) => `${label(s.key)} ${Math.round(s.pct)}%`).join(', ')}>
        {slices.map((s) => (
          <div
            key={s.key}
            title={`${label(s.key)}: ${Math.round(s.pct)}%`}
            className="h-full"
            style={{ width: `${s.pct}%`, background: view.color(s.key), ...(view.hatched(s.key) ? HATCH_STYLE : {}) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink">
        {slices.map((s) => {
          const swatch = view.hatched(s.key) ? <HatchedSwatch className="h-2.5 w-2.5 rounded-sm" /> : <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: view.color(s.key) }} />
          return room && onPick && (s.key === 'teacher' || s.key === 'student') ? (
            <button key={s.key} type="button" onClick={() => onPick({ kind: s.key as 'teacher' | 'student' })} className="flex items-center gap-1.5 hover:underline">
              {swatch}
              {label(s.key)} <b>{Math.round(s.pct)}%</b>
            </button>
          ) : (
            <span key={s.key} className="flex items-center gap-1.5">
              {swatch}
              {label(s.key)} <b>{Math.round(s.pct)}%</b>
            </span>
          )
        })}
      </div>
      <svg viewBox={`0 0 ${W} 78`} width="100%" role="img" aria-label="What the recording held, across the lesson" onMouseLeave={() => setHover(null)}>
        <defs>
          <pattern id="flow-strip-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-cream)" />
            <rect width="2" height="6" fill="var(--color-hairline)" />
          </pattern>
        </defs>
        {view.bins.map((k, i) => (
          <rect
            key={i}
            x={i * binW}
            y="18"
            width={Math.max(0.5, binW - 1)}
            height="40"
            fill={view.hatched(k) ? 'url(#flow-strip-hatch)' : view.color(k)}
            opacity={hover == null || hover === i ? 1 : 0.55}
            onMouseEnter={() => setHover(i)}
            onClick={room && onPick && (k === 'teacher' || k === 'student') ? () => onPick({ startSec: i * view.binSec, endSec: (i + 1) * view.binSec }) : undefined}
            style={room && onPick && (k === 'teacher' || k === 'student') ? { cursor: 'pointer' } : undefined}
          />
        ))}
        {marks.map((m, i) => (
          <g key={i}>
            <title>{`${mmss(m.t)} · ${MARK[m.kind].label.toLowerCase()}`}</title>
            <MarkShape kind={m.kind} x={x(m.t)} y={9} size={10} />
          </g>
        ))}
        <text x="0" y="76" fontSize="11" fill="var(--color-ink-soft)">0:00</text>
        <text x={W} y="76" fontSize="11" textAnchor="end" fill="var(--color-ink-soft)">{mmss(duration)}</text>
      </svg>
      <p className="m-0 h-4 text-xs text-ink-soft" aria-live="polite">
        {hover != null && `${mmss(hover * view.binSec)}–${mmss((hover + 1) * view.binSec)} · mostly ${label(view.bins[hover]).toLowerCase()}`}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {(['invite', 'probe', 'voices', 'check'] as const)
          .filter((k) => marks.some((m) => m.kind === k))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true">
                <MarkShape kind={k} x={6} y={6} size={10} />
              </svg>
              {MARK[k].label}
            </span>
          ))}
      </div>
      {room ? (
        <p className="text-xs text-ink-soft">
          “Teacher Voice” and “Student Voice” are seconds with words the transcript gave to you or to a student, and the
          short pauses between them. “Group Voice” is sound with no transcribed words — most often students talking
          together; music or other room sound is counted here too.
          {room.videoSec > 0 ? ' “Video/Audio” is the voice you marked as one.' : ''}
        </p>
      ) : (
        <p className="text-xs text-ink-soft">
          {flow?.hasEnvelope && '“Sound, no words” is sound the microphone caught but couldn’t turn into words. '}
          “Students” is speech the transcript didn’t attribute to you — a student close to you can be heard as you, and you as them.
        </p>
      )}
    </div>
  )
}
