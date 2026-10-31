import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { teacherPauseOf } from '../lib/teacherPause.ts'

// Stores Teacher Pause Time on lessons analysed before the server stored it.
//
// Until 2026-10-31 the web page and the iPhone app each worked the pause out
// for themselves every time a lesson opened. Both now only show the stored
// figure, so a lesson without one shows "not worked out yet" until this runs.
//
// Arithmetic on the stored segments, question log and teaching moves only —
// nothing is re-read, and nothing else in metricsDetail is touched. A lesson
// that already has a stored pause is left alone: a stored figure is what the
// teacher has seen, and moving it is a decision, made with --redo.
//
//   tsx src/scripts/backfillTeacherPause.ts --all            (dry run)
//   tsx src/scripts/backfillTeacherPause.ts --all --write
//   tsx src/scripts/backfillTeacherPause.ts --all --redo --write
const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
if (!process.argv.includes('--all')) {
  console.error('Pass --all to mean it (a dry run unless --write).')
  process.exit(1)
}

const rows = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, durationSec: true, metricsDetail: true, questionLog: true, teachingMoves: true },
})

const tally: Record<string, number> = {}
let changed = 0
console.log(['lesson', 'date', 'min', 'pause', 'reason', 'answers in your voice', 'thinking timed'].join('\t'))
for (const r of rows) {
  const detail = (r.metricsDetail ?? {}) as Record<string, unknown>
  if (detail.teacherPause && !redo) continue
  const segments = await prisma.transcriptSegment.findMany({
    where: { sessionId: r.id, speakerLabel: { not: 'Video' } },
    orderBy: { startSec: 'asc' },
    select: { speakerLabel: true, startSec: true, endSec: true, text: true },
  })
  const pause = teacherPauseOf(segments, r.questionLog, r.teachingMoves)
  const key = pause.reason ?? 'shown'
  tally[key] = (tally[key] ?? 0) + 1
  console.log(
    [
      r.id.slice(0, 8),
      r.createdAt.toISOString().slice(0, 10),
      Math.round((r.durationSec ?? 0) / 60),
      pause.average ?? '—',
      pause.reason ?? '',
      `${pause.foldedCount}/${pause.questionCount}`,
      `${pause.thinking.filter((p) => p.sec != null).length}/${pause.thinking.length}`,
    ].join('\t'),
  )
  if (write) {
    await prisma.audioSession.update({ where: { id: r.id }, data: { metricsDetail: { ...detail, teacherPause: pause } as object } })
  }
  changed++
}
console.log(`\n${changed} lesson(s) ${write ? 'written' : 'would be written (dry run)'}:`, tally)
await prisma.$disconnect()
