// How long the room had to think after a question: from the end of the
// teacher's turn with the question in it to the next voice of anyone — a
// student answering or the teacher speaking again.
//
// Read from the transcript, so it works on every lesson that has one. The
// limits match the server's pause measure (audioAnalysis.ts): two teacher
// lines under 2 seconds apart are one turn still running, and a gap over
// 30 seconds is independent work or a hole in the recording, not a pause.

const MAX_JOIN_GAP_SEC = 2
const MAX_PAUSE_SEC = 30
/// More than this many words after the question, in the same turn, and the
/// teacher kept talking rather than leaving it with students: no pause.
const MAX_WORDS_AFTER = 3

type Seg = { speakerLabel: string; startSec: number; endSec: number; text: string }

export type Pause = { sec: number; next: 'you' | 'student' | 'kept_talking' }

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)

/// The pause after each question, in the order given, and whose voice ended
/// it; null where it could not be measured. A question the teacher talked
/// straight past — more words in the same turn — is a pause of zero.
export function pausesAfter(segments: Seg[], questions: { timestampSec: number; quote: string }[]): (Pause | null)[] {
  const ordered = segments.filter((s) => s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  return questions.map(({ timestampSec: t, quote }) => {
    const idx = ordered.findIndex((s) => s.endSec > t)
    if (idx === -1 || ordered[idx].speakerLabel !== 'Teacher') return null
    let end = idx
    while (
      end + 1 < ordered.length &&
      ordered[end + 1].speakerLabel === 'Teacher' &&
      ordered[end + 1].startSec - ordered[end].endSec <= MAX_JOIN_GAP_SEC
    ) {
      end++
    }
    // Where the question sits in the turn: the words after its last one.
    const turn = words(ordered.slice(idx, end + 1).map((x) => x.text).join(' '))
    const q = words(quote)
    const tail = q.slice(-3).join(' ')
    let at = -1
    for (let i = 0; i + 3 <= turn.length; i++) if (turn.slice(i, i + 3).join(' ') === tail) at = i + 3
    if (at !== -1 && turn.length - at > MAX_WORDS_AFTER) return { sec: 0, next: 'kept_talking' }
    const next = ordered[end + 1]
    if (!next) return null
    const gap = next.startSec - ordered[end].endSec
    if (gap < 0 || gap > MAX_PAUSE_SEC) return null
    return { sec: Math.round(gap * 10) / 10, next: next.speakerLabel === 'Teacher' ? 'you' : 'student' }
  })
}

/// The average of the pauses that could be measured, to a tenth of a second;
/// null when none could.
export function averagePause(pauses: (Pause | null)[]): number | null {
  const measured = pauses.filter((p): p is Pause => p != null).map((p) => p.sec)
  if (measured.length === 0) return null
  return Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10
}
