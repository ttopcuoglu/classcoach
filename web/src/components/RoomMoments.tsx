// The moments behind one share of the lesson, opened from its tile or from a
// block of the strip, so every number can be checked against what was said.
//
// Teacher Voice is its lines. Student Voice is the conversation: each time
// students were heard, between what the teacher said before and after. Group Voice, Quiet Time
// and Video/Audio have no lines of the lesson's own — a video's are left out
// of every read of it, and the others had no words — so they are where they
// happened, each with the last thing said before it, which is how a teacher
// places a stretch ("that's when I said turn to your partner").

import { roomRuns, type RoomBreakdown, type RoomKind } from '../lib/roomBreakdown'
import type { TranscriptSegment } from '../lib/api'
import { exchanges } from '../lib/exchanges'
import { ROOM_COLOR, ROOM_LABEL } from './TalkFlowStrip'

export type RoomPick = { kind: RoomKind } | { startSec: number; endSec: number }

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function length(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m ? `${m} min${s ? ` ${s} s` : ''}` : `${s} s`
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

export default function RoomMoments({
  room,
  segments,
  pick,
  onClose,
}: {
  room: RoomBreakdown
  segments: TranscriptSegment[]
  pick: RoomPick
  onClose: () => void
}) {
  const lines = spoken(segments)
  const before = (sec: number) => [...lines].reverse().find((s) => s.startSec < sec)

  let title: string
  let color: string | undefined
  let body: React.ReactNode
  if ('kind' in pick && pick.kind === 'teacher') {
    const own = lines.filter((s) => s.speakerLabel === 'Teacher')
    title = `${ROOM_LABEL.teacher} · ${own.length} line${own.length === 1 ? '' : 's'}`
    color = ROOM_COLOR.teacher
    body = own.length ? own.map((s) => <Line key={s.id} s={s} />) : <p className="text-sm text-ink-soft">None were transcribed.</p>
  } else if ('kind' in pick && pick.kind === 'student') {
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
  } else if ('kind' in pick) {
    const runs = roomRuns(room, pick.kind, pick.kind === 'video' ? 10 : 15)
    title = `${ROOM_LABEL[pick.kind]} · ${runs.length} stretch${runs.length === 1 ? '' : 'es'}`
    color = ROOM_COLOR[pick.kind]
    body = runs.length ? (
      runs.map((r) => {
        const prior = before(r.startSec)
        return (
          <div key={r.startSec} className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-ink">
              {mmss(r.startSec)}–{mmss(r.endSec)} <span className="font-normal text-ink-soft">· {length(r.endSec - r.startSec)}</span>
            </p>
            {prior && <p className="text-xs text-ink-soft">Just before: “{prior.text.trim()}”</p>}
          </div>
        )
      })
    ) : (
      <p className="text-sm text-ink-soft">Only short moments, none long enough to list.</p>
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
