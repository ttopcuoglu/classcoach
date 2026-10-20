// How long the teacher left a question with the class: from the end of the
// teacher's turn with the question in it to the moment the teacher spoke
// again. A student answering inside that time is part of it — this is the
// teacher's half, how long before they stepped back in.
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

/// `answered`: a student was heard before the teacher spoke again.
export type Pause = { sec: number; answered: boolean; keptTalking?: true }

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean)

/// The time after each question until the teacher spoke again, in the order
/// given; null where it could not be measured. A question the teacher talked
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
    if (at !== -1 && turn.length - at > MAX_WORDS_AFTER) return { sec: 0, answered: false, keptTalking: true }
    const rest = ordered.slice(end + 1)
    const nextTeacher = rest.find((x) => x.speakerLabel === 'Teacher')
    if (!nextTeacher) return null
    const gap = nextTeacher.startSec - ordered[end].endSec
    if (gap < 0 || gap > MAX_PAUSE_SEC) return null
    const answered = rest.some((x) => x.speakerLabel !== 'Teacher' && x.startSec < nextTeacher.startSec)
    return { sec: Math.round(gap * 10) / 10, answered }
  })
}

/// The average of the pauses that could be measured, to a tenth of a second;
/// null when none could.
export function averagePause(pauses: (Pause | null)[]): number | null {
  const measured = pauses.filter((p): p is Pause => p != null).map((p) => p.sec)
  if (measured.length === 0) return null
  return Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10
}
