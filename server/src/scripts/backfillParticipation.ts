import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { readParticipation } from '../lib/participation.ts'
import { prisma } from '../lib/prisma.ts'

// Reads how the teacher brought students in (lib/participation.ts) for
// lessons analyzed before that read, and stores it with their teaching
// moves. One model call per lesson; nothing else changes. Lessons with no
// teaching-moves read are skipped — the page has nowhere to show it.
// Demo and test accounts are skipped.
//
// Prints each lesson's moments and writes nothing unless --write is passed.
// A dry run still makes the model calls.
//
//   tsx src/scripts/backfillParticipation.ts [--redo] [--write]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')

function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
}
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, teachingMoves: { not: Prisma.DbNull } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, teachingMoves: true, user: { select: { email: true } } },
})

const tally = { lessons: 0, failed: 0, invitations: 0, extending: 0, widening: 0, formats: {} as Record<string, number>, kinds: {} as Record<string, number> }
for (const session of sessions) {
  if (isDemoAccount(session.user.email)) continue
  const moves = session.teachingMoves as Record<string, unknown>
  if (!redo && moves.participation) continue
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const p = await readParticipation(segments)
  console.log(`\n${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (!p) {
    tally.failed++
    console.log('  read failed or too little teacher speech — left as it was')
    continue
  }
  tally.lessons++
  for (const q of p.invitations) {
    tally.invitations++
    tally.formats[q.format] = (tally.formats[q.format] ?? 0) + 1
    console.log(`  invite  ${mmss(q.timestampSec)} [${q.format}] "${q.quote}"`)
  }
  for (const q of p.extending) {
    tally.extending++
    tally.kinds[q.kind] = (tally.kinds[q.kind] ?? 0) + 1
    console.log(`  extend  ${mmss(q.timestampSec)} [${q.kind}] "${q.quote}"`)
  }
  for (const q of p.widening) {
    tally.widening++
    console.log(`  widen   ${mmss(q.timestampSec)} "${q.quote}"`)
  }
  if (write) {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { teachingMoves: { ...moves, participation: p } as unknown as Prisma.InputJsonValue },
    })
  }
}
console.log(
  `\n${tally.lessons} lessons read, ${tally.failed} skipped${write ? ' (written)' : ' (dry run — nothing written)'}.` +
    `\nInvitations ${tally.invitations} ${JSON.stringify(tally.formats)}; extending ${tally.extending} ${JSON.stringify(tally.kinds)}; widening ${tally.widening}.`,
)
await prisma.$disconnect()
