// What was said behind a Talk & Participation number, opened from its tile or
// from a block of the strip, so the number can be checked against the
// transcript. Teacher Voice is the teacher's lines; Student Voice is the
// conversation: each time students were heard, between what the teacher said
// before and after. Students Called On and Think Time are each moment with the
// line before and the line after, so the whole exchange reads. The shares with
// no words open nothing.

import type { RoomKind } from '../lib/roomBreakdown'
import type { StoredThinkTime, TranscriptSegment } from '../lib/api'
import { exchanges } from '../lib/exchanges'
import { ROOM_COLOR, ROOM_LABEL } from './TalkFlowStrip'

export type RoomPick =
  | { kind: Extract<RoomKind, 'teacher' | 'student'> }
  | { moments: 'calledOn' | 'think' }
  | { startSec: number; endSec: number }

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

const spoken = (segments: TranscriptSegment[]) => segments.filter((s) => s.text.trim())

function Line({ s, who }: { s: TranscriptSegment; who?: boolean }) {
  const teacher = s.speakerLabel === 'Teacher'
  return (
    <p className={`text-sm ${who && teacher ? 'text-ink-soft' : 'text-ink'}`}>
      <span className="mr-2 font-mono text-xs text-ink-soft">{mmss(s.startSec)}</span>
      {(who || !teacher) && (
        <span className="mr-1 text-xs font-semibold" style={{ color: ROOM_COLOR[teacher ? 'teacher' : 'student'] }}>
          {teacher ? 'You:' : 'Student:'}
        </span>
      )}
      {s.text.trim()}
    </p>
  )
}

/// The line said at `sec`, with the one before it and the one after it.
function around(lines: TranscriptSegment[], sec: number): TranscriptSegment[] {
  let at = lines.findIndex((s) => s.endSec > sec)
  if (at === -1) at = lines.length - 1
  return lines.slice(Math.max(0, at - 1), at + 2)
}

export default function RoomMoments({
  segments,
  pick,
  calledOn = [],
  think,
  onClose,
}: {
  segments: TranscriptSegment[]
  pick: RoomPick
  /// Each line that called on a student by name.
  calledOn?: { timestampSec: number }[]
  think?: StoredThinkTime
  onClose: () => void
}) {
  const lines = [...spoken(segments)].sort((a, b) => a.startSec - b.startSec)
  const before = (sec: number) => [...lines].reverse().find((s) => s.startSec < sec)

  let title: string
  let color: string | undefined
  let body: React.ReactNode
  if ('kind' in pick && pick.kind === 'teacher') {
    const own = lines.filter((s) => s.speakerLabel === 'Teacher')
    title = `${ROOM_LABEL.teacher} · ${own.length} line${own.length === 1 ? '' : 's'}`
    color = ROOM_COLOR.teacher
    body = own.length ? own.map((s) => <Line key={s.id} s={s} />) : <p className="text-sm text-ink-soft">None were transcribed.</p>
  } else if ('moments' in pick && pick.moments === 'calledOn') {
    title = `Students Called On · ${calledOn.length} time${calledOn.length === 1 ? '' : 's'}`
    body = calledOn.length ? (
      calledOn.map((m) => (
        <div key={m.timestampSec} className="flex flex-col gap-1 border-b border-hairline pb-2 last:border-b-0">
          {around(lines, m.timestampSec).map((s) => (
            <Line key={s.id} s={s} who />
          ))}
        </div>
      ))
    ) : (
      <p className="text-sm text-ink-soft">No student was called on by name.</p>
    )
  } else if ('moments' in pick) {
    const timed = (think?.questions ?? []).filter((q) => q.sec != null)
    title = `Think Time · ${timed.length} question${timed.length === 1 ? '' : 's'}`
    body = timed.length ? (
      timed.map((q) => {
        const three = around(lines, q.timestampSec)
        const own = lines.find((s) => s.endSec > q.timestampSec)
        return (
          <div key={q.timestampSec} className="flex flex-col gap-1 border-b border-hairline pb-2 last:border-b-0">
            {three.map((s) => (
              <div key={s.id} className="flex flex-col gap-1">
                <Line s={s} who />
                {s.id === own?.id && (
                  <p className="pl-12 text-xs font-semibold text-ink-soft">Quiet after the question: {q.sec!.toFixed(1)} s</p>
                )}
              </div>
            ))}
          </div>
        )
      })
    ) : (
      <p className="text-sm text-ink-soft">No question could be timed.</p>
    )
  } else if ('kind' in pick) {
    const talk = exchanges(segments)
    title = `${ROOM_LABEL.student} · ${talk.length} exchange${talk.length === 1 ? '' : 's'}`
    color = ROOM_COLOR.student
    body = talk.length ? (
      talk.map((x) => (
        <div key={x.students[0].id} className="flex flex-col gap-1 border-b border-hairline pb-2 last:border-b-0">
          {x.before && <Line s={x.before} who />}
          {x.students.map((s) => (
            <Line key={s.id} s={s} who />
          ))}
          {x.after && <Line s={x.after} who />}
        </div>
      ))
    ) : (
      <p className="text-sm text-ink-soft">No student words were transcribed.</p>
    )
  } else {
    const inside = lines.filter((s) => s.endSec > pick.startSec && s.startSec < pick.endSec)
    const prior = before(pick.startSec)
    title = `${mmss(pick.startSec)}–${mmss(pick.endSec)}`
    body = inside.length ? (
      inside.map((s) => <Line key={s.id} s={s} who />)
    ) : (
      <p className="text-sm text-ink-soft">
        No words were transcribed here.{prior ? ` Just before: “${prior.text.trim()}”` : ''}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-cream-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-heading text-base font-bold text-forest">
          {color && <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
          {title}
        </p>
        <button type="button" onClick={onClose} className="text-sm font-medium text-ink-soft hover:text-ink">
          Close
        </button>
      </div>
      <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">{body}</div>
    </div>
  )
}
