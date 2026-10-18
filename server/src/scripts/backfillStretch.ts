import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { prisma } from '../lib/prisma.ts'
import { readStretch, stretchLines } from '../lib/stretchBreak.ts'

// Reads the longest stretch of teacher talk (lib/stretchBreak.ts) for lessons
// analyzed before that read: what it was about, and a break only where the
// content offers one. One model call per lesson with a stretch of 2 minutes
// or more; nothing else changes. Stored with the teaching moves, so lessons
// without that read are skipped. Demo and test accounts are skipped.
//
// Prints each result and writes nothing unless --write is passed. A dry run
// still makes the model calls.
//
//   tsx src/scripts/backfillStretch.ts [--redo] [--write]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
const isDemo = (email: string) => email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, teachingMoves: { not: Prisma.DbNull } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, teachingMoves: true, user: { select: { email: true } } },
})
const tally = { read: 0, noStretch: 0, failed: 0, breaks: 0 }
for (const session of sessions) {
  if (isDemo(session.user.email)) continue
  const moves = session.teachingMoves as Record<string, unknown>
  if (!redo && moves.stretch) continue
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const head = `${session.id}  ${session.createdAt.toISOString().slice(0, 10)}`
  const found = stretchLines(segments)
  if (!found) {
    tally.noStretch++
    console.log(`${head}  no stretch of 2 min or more`)
    continue
  }
  const read = await readStretch(segments)
  if (!read) {
    tally.failed++
    console.log(`${head}  read failed`)
    continue
  }
  tally.read++
  console.log(`${head}  ${mmss(read.startSec)}–${mmss(read.endSec)} (${Math.round((read.endSec - read.startSec) / 60)} min) · ${read.about ?? '—'}`)
  console.log(`      opens: "${found.lines[0].text.slice(0, 110)}"`)
  if (read.breakAfter) {
    tally.breaks++
    console.log(`      break after ${mmss(read.breakAfter.atSec)} "${read.breakAfter.quote}" — ${read.breakAfter.closes} → ${read.breakAfter.move}`)
  } else console.log('      no break suggested')
  if (write) {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { teachingMoves: { ...moves, stretch: read } as unknown as Prisma.InputJsonValue },
    })
  }
}
console.log(`\n${tally.read} stretches read, ${tally.breaks} with a break; ${tally.noStretch} lessons had none long enough; ${tally.failed} failed${write ? ' (written)' : ' (dry run — nothing written)'}.`)
await prisma.$disconnect()
