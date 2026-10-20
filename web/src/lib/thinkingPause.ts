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

type Seg = { speakerLabel: string; startSec: number; endSec: number; text: string }

/// The pause after each question asked at `questionTimes`, in the order
/// given; null where it could not be measured.
export function pausesAfter(segments: Seg[], questionTimes: number[]): (number | null)[] {
  const ordered = segments.filter((s) => s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  return questionTimes.map((t) => {
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
    const next = ordered[end + 1]
    if (!next) return null
    const gap = next.startSec - ordered[end].endSec
    return gap < 0 || gap > MAX_PAUSE_SEC ? null : Math.round(gap * 10) / 10
  })
}

/// The average of the pauses that could be measured, to a tenth of a second;
/// null when none could.
export function averagePause(pauses: (number | null)[]): number | null {
  const measured = pauses.filter((p): p is number => p != null)
  if (measured.length === 0) return null
  return Math.round((measured.reduce((a, b) => a + b, 0) / measured.length) * 10) / 10
}
