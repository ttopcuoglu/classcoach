// The lesson's back-and-forth: every time a student was heard, with what the
// teacher said just before and just after. Built from the order of the
// transcript's lines alone, so it is exactly as right as the transcript.

import type { TranscriptSegment } from './api'

export type Exchange = {
  /// The teacher's last line before the students spoke, if there was one.
  before: TranscriptSegment | null
  /// The student lines heard one after another, with no teacher line between.
  students: TranscriptSegment[]
  /// The teacher's next line, if there was one.
  after: TranscriptSegment | null
}

export function exchanges(segments: TranscriptSegment[]): Exchange[] {
  const lines = segments.filter((s) => s.text.trim()).sort((a, b) => a.startSec - b.startSec)
  const out: Exchange[] = []
  let lastTeacher: TranscriptSegment | null = null
  let current: Exchange | null = null
  for (const line of lines) {
    if (line.speakerLabel === 'Teacher') {
      if (current) {
        current.after = line
        out.push(current)
        current = null
      }
      lastTeacher = line
    } else if (current) {
      current.students.push(line)
    } else {
      current = { before: lastTeacher, students: [line], after: null }
    }
  }
  if (current) out.push(current)
  return out
}
