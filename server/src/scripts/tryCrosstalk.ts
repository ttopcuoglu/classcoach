import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'

// Does the crosstalk signal survive into what we store? Deepgram's diarized
// utterances can overlap in time when people speak at once; if those overlaps
// are preserved in TranscriptSegment, "talking over each other" is measurable
// retroactively on every lesson already recorded. If they are not, no amount
// of prompt work will tell a rowdy room from an engaged one.
const ids = process.argv.slice(2)
for (const id of ids) {
  const segs = await prisma.transcriptSegment.findMany({
    where: { sessionId: id },
    orderBy: { startSec: 'asc' },
    select: { speakerLabel: true, startSec: true, endSec: true, text: true },
  })
  let overlapSec = 0
  let overlapCount = 0
  let studentOverTeacher = 0
  let teacherOverStudent = 0
  const studentTurns = segs.filter((s) => s.speakerLabel === 'Student')
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1]
    const cur = segs[i]
    const gap = cur.startSec - prev.endSec
    if (gap < -0.05) {
      overlapSec += Math.min(-gap, cur.endSec - cur.startSec)
      overlapCount++
      if (prev.speakerLabel === 'Teacher' && cur.speakerLabel === 'Student') studentOverTeacher++
      if (prev.speakerLabel === 'Student' && cur.speakerLabel === 'Teacher') teacherOverStudent++
    }
  }
  const spoken = segs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0)
  const meanStudentTurn = studentTurns.length
    ? studentTurns.reduce((sum, s) => sum + (s.endSec - s.startSec), 0) / studentTurns.length
    : 0
  const shortBursts = studentTurns.filter((s) => s.endSec - s.startSec < 1.5).length
  console.log(
    `${id}  segs=${segs.length}  overlaps=${overlapCount} (${overlapSec.toFixed(1)}s, ${((overlapSec / Math.max(spoken, 1)) * 100).toFixed(1)}% of speech)` +
      `  studentOverTeacher=${studentOverTeacher} teacherOverStudent=${teacherOverStudent}` +
      `  studentTurns=${studentTurns.length} meanTurn=${meanStudentTurn.toFixed(1)}s under1.5s=${shortBursts}`,
  )
}
await prisma.$disconnect()
