import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { readLessonArc } from '../lib/lessonArc.ts'
import { prisma } from '../lib/prisma.ts'

// Reads how each lesson moved (lib/lessonArc.ts) for lessons analyzed before
// that read, stored with the teaching moves. One model call per lesson;
// nothing else changes. Demo and test accounts are skipped. Prints each arc
// and writes nothing unless --write is passed; a dry run still makes the calls.
//
//   tsx src/scripts/backfillLessonArc.ts [--redo] [--write]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
const isDemo = (email: string) => email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, teachingMoves: { not: Prisma.DbNull } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, durationSec: true, teachingMoves: true, user: { select: { email: true } } },
})
let read = 0
let none = 0
for (const session of sessions) {
  if (isDemo(session.user.email)) continue
  const moves = session.teachingMoves as Record<string, unknown>
  if (!redo && moves.arc) continue
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const duration = session.durationSec ?? segments.reduce((max, s) => Math.max(max, s.endSec), 0)
  const arc = await readLessonArc(segments, duration)
  console.log(`\n${session.id}  ${session.createdAt.toISOString().slice(0, 10)}  (${mmss(duration)})`)
  if (!arc) {
    none++
    console.log('  no arc')
    continue
  }
  read++
  for (const s of arc) console.log(`  ${s.role.padEnd(9)} ${mmss(s.startSec)}–${mmss(s.endSec)}  ${s.title}`)
  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { teachingMoves: { ...moves, arc } as unknown as Prisma.InputJsonValue } })
  }
}
console.log(`\n${read} arcs read, ${none} without${write ? ' (written)' : ' (dry run — nothing written)'}.`)
await prisma.$disconnect()
