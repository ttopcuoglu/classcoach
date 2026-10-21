import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { parseLevelTrace } from '../lib/settleTime.ts'

// Can loudness tell the teacher's voice from another voice the teacher's
// diarized speaker swallowed?
//
// The teacher is nearest the phone, so their lines should sit at a steady
// level and a student's line folded into their speaker should sit well below
// it. If that holds, the level of each teacher-tagged line relative to the
// teacher's own median separates the two. Read-only: prints distributions
// and changes nothing.
//
// The reference for "another voice" is the lines tagged Student on the same
// lessons — imperfect, since some of those are the teacher, but if the two
// distributions overlap completely the signal is not there.
//
//   tsx src/scripts/tryVoiceLevel.ts                 every lesson with a trace
//   tsx src/scripts/tryVoiceLevel.ts --find "eliminate bias"

const args = process.argv.slice(2)
const findFlag = args.indexOf('--find')
const find = findFlag === -1 ? null : args[findFlag + 1].toLowerCase()

/// A line's level: the median of the trace seconds it covers. Lines shorter
/// than a second still get the second they start in.
function lineLevel(trace: number[], startSec: number, endSec: number): number | null {
  const from = Math.floor(startSec)
  const to = Math.max(from + 1, Math.ceil(endSec))
  const values = trace.slice(from, to).filter((v) => Number.isFinite(v))
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const sessions = await prisma.audioSession.findMany({
  where: { levelTrace: { not: null as never }, status: { in: ['analyzed', 'locked'] } },
  select: { id: true, durationSec: true, levelTrace: true },
})
console.log(`${sessions.length} analyzed lessons carry a loudness trace\n`)

const teacherRatios: number[] = []
const studentRatios: number[] = []
const perLesson: string[] = []

for (const session of sessions) {
  const trace = parseLevelTrace(session.levelTrace)
  if (!trace) continue
  const segs = await prisma.transcriptSegment.findMany({
    where: { sessionId: session.id },
    orderBy: { startSec: 'asc' },
    select: { speakerLabel: true, startSec: true, endSec: true, text: true },
  })
  const teacherLevels = segs
    .filter((s) => s.speakerLabel === 'Teacher')
    .map((s) => lineLevel(trace, s.startSec, s.endSec))
    .filter((v): v is number => v != null && v > 0)
  if (teacherLevels.length < 10) continue
  const sorted = [...teacherLevels].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  let lessonLow = 0
  let lessonTeacher = 0
  for (const s of segs) {
    const level = lineLevel(trace, s.startSec, s.endSec)
    if (level == null) continue
    const ratio = level / median
    if (s.speakerLabel === 'Teacher') {
      teacherRatios.push(ratio)
      lessonTeacher++
      if (ratio < 0.5) lessonLow++
    } else if (s.speakerLabel === 'Student') {
      studentRatios.push(ratio)
    }
    if (find && s.text.toLowerCase().includes(find)) {
      console.log(`FOUND ${session.id} ${s.speakerLabel} @${s.startSec.toFixed(0)}s ratio=${ratio.toFixed(2)} "${s.text.slice(0, 120)}"`)
    }
  }
  perLesson.push(`${session.id.slice(0, 8)}  teacher lines=${lessonTeacher}  below 0.5×=${lessonLow} (${((lessonLow / Math.max(lessonTeacher, 1)) * 100).toFixed(0)}%)  median=${median.toFixed(2)}`)
}

function histogram(label: string, values: number[]) {
  const edges = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0, 1.25, 1.5, 2, Infinity]
  const counts = edges.slice(0, -1).map((lo, i) => values.filter((v) => v >= lo && v < edges[i + 1]).length)
  console.log(`${label} (n=${values.length})`)
  edges.slice(0, -1).forEach((lo, i) => {
    const pct = values.length ? (counts[i] / values.length) * 100 : 0
    const hi = edges[i + 1] === Infinity ? '∞' : edges[i + 1].toFixed(2)
    console.log(`  ${lo.toFixed(2)}–${hi}  ${String(counts[i]).padStart(5)}  ${pct.toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(pct))}`)
  })
}

histogram('Teacher-tagged lines, level ÷ teacher median', teacherRatios)
histogram('Student-tagged lines, level ÷ teacher median', studentRatios)
console.log('\nPer lesson:')
for (const line of perLesson) console.log(`  ${line}`)
await prisma.$disconnect()
