// The transcript as Talk & Participation reads it: each student's words that
// the transcript gave the teacher, found by the server from the conversation
// (server lib/studentWords.ts), cut out of the teacher's line as a line of
// their own. For showing only — the numbers are the server's.

import type { StudentSpan, TranscriptSegment } from './api'

export function withStudentSpans(segments: TranscriptSegment[], spans: StudentSpan[] | undefined): TranscriptSegment[] {
  if (!spans?.length) return segments
  const out: TranscriptSegment[] = []
  for (const seg of segments) {
    const inside = seg.speakerLabel === 'Teacher' ? spans.filter((s) => Math.abs(s.lineStartSec - seg.startSec) < 0.01) : []
    let rest = seg.text
    let from = seg.startSec
    let n = 0
    for (const s of inside) {
      const at = rest.indexOf(s.text)
      if (at === -1) continue
      const head = rest.slice(0, at).trim()
      if (head) out.push({ ...seg, id: `${seg.id}:${n++}`, startSec: from, endSec: s.startSec, text: head })
      out.push({ ...seg, id: `${seg.id}:${n++}`, speakerLabel: 'Student', startSec: s.startSec, endSec: s.endSec, text: s.text })
      rest = rest.slice(at + s.text.length)
      from = s.endSec
    }
    if (n === 0) out.push(seg)
    else if (rest.trim()) out.push({ ...seg, id: `${seg.id}:${n}`, startSec: from, text: rest.trim() })
  }
  return out
}
