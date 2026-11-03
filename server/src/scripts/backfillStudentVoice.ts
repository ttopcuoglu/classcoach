import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
import { buildRoomTrace, roomShares } from '../lib/roomTrace.ts'
import { dropTeacherQuotes, readStudentWords, STUDENT_WORDS_VERSION, teacherQuotesOf, withStudentSpans } from '../lib/studentWords.ts'
import { keepVoiceClasses } from '../lib/voiceActivity.ts'

// Student Talk from the conversation (lib/studentWords.ts) on lessons
// analysed before it existed: reads each lesson's transcript once with the
// model, then rebuilds the room trace — Teacher Talk, Student Talk, Group
// Talk and Silence — with the student words it found. Nothing else in
// metricsDetail is touched, and the stored transcript never changes.
//
// One model read per lesson, dry run or not. Only lessons with voice classes
// (iPhone recordings since they shipped) have a room trace to rebuild.
//
//   tsx src/scripts/backfillStudentVoice.ts --recent 10 --show     (dry run, prints the words)
//   tsx src/scripts/backfillStudentVoice.ts --all                  (dry run)
//   tsx src/scripts/backfillStudentVoice.ts --all --write
//   tsx src/scripts/backfillStudentVoice.ts --all --redo --write
const args = process.argv.slice(2)
const write = args.includes('--write')
const redo = args.includes('--redo')
const show = args.includes('--show')
const recentAt = args.indexOf('--recent')
const recent = recentAt === -1 ? null : Number(args[recentAt + 1])
if (!args.includes('--all') && !recent) {
  console.error('Pass --all or --recent N (a dry run unless --write).')
  process.exit(1)
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 10 : 0)

const rows = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, metricsDetail: true, questionLog: true, teachingMoves: true },
})

let done = 0
let failed = 0
console.log(['lesson', 'date', 'words found', 'teacher % before → after', 'student % before → after'].join('\t'))
for (const r of rows) {
  if (recent && done + failed >= recent) break
  const detail = (r.metricsDetail ?? {}) as Record<string, unknown>
  if (typeof detail.studentWordsVersion === 'number' && !redo) continue
  const voices = keepVoiceClasses(detail)
  if (voices.voiceTrace === undefined) continue
  const all = await prisma.transcriptSegment.findMany({
    where: { sessionId: r.id },
    orderBy: { startSec: 'asc' },
    select: { speakerLabel: true, startSec: true, endSec: true, text: true },
  })
  const segments = all.filter((s) => s.speakerLabel !== 'Video')
  const video = all.filter((s) => s.speakerLabel === 'Video')
  const found = await readStudentWords(segments)
  if (!found) {
    failed++
    console.log([r.id.slice(0, 8), r.createdAt.toISOString().slice(0, 10), 'read failed'].join('\t'))
    continue
  }
  const spans = dropTeacherQuotes(found, teacherQuotesOf(r.teachingMoves, r.questionLog))
  const before = roomShares(typeof detail.roomTrace === 'string' ? detail.roomTrace : buildRoomTrace(voices, all))
  const roomTrace = buildRoomTrace(voices, [...withStudentSpans(segments, spans), ...video])
  const after = roomShares(roomTrace)
  const total = roomTrace.length
  console.log(
    [
      r.id.slice(0, 8),
      r.createdAt.toISOString().slice(0, 10),
      spans.length,
      `${pct(before.roomTeacherSec, total)} → ${pct(after.roomTeacherSec, total)}`,
      `${pct(before.roomStudentSec + before.roomGroupSec, total)} → ${pct(after.roomStudentSec + after.roomGroupSec, total)}`,
    ].join('\t'),
  )
  if (show) for (const s of spans) console.log(`    ${mmss(s.startSec)}  “${s.text}”`)
  if (write) {
    await prisma.audioSession.update({
      where: { id: r.id },
      data: {
        metricsDetail: { ...detail, roomTrace, ...after, studentSpans: spans, studentWordsVersion: STUDENT_WORDS_VERSION } as object,
      },
    })
  }
  done++
}
console.log(`\n${done} lesson(s) ${write ? 'written' : 'read (dry run, nothing written)'}${failed ? `, ${failed} read(s) failed` : ''}`)
await prisma.$disconnect()
