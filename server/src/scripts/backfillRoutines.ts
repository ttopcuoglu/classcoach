import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { readRoutines } from '../lib/routines.ts'
import type { Quoted } from '../lib/teachingMoves.ts'
import { prisma } from '../lib/prisma.ts'

// Reads routine types for each set of directions and invitations to seek
// help (lib/routines.ts) for lessons analyzed before that read, stored with
// the teaching moves. One model call per lesson; nothing else changes. Demo
// and test accounts are skipped. Prints results and writes nothing unless
// --write is passed; a dry run still makes the calls.
//
//   tsx src/scripts/backfillRoutines.ts [--redo] [--write]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
const isDemo = (email: string) => email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, teachingMoves: { not: Prisma.DbNull } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, teachingMoves: true, user: { select: { email: true } } },
})
const tally: Record<string, number> = {}
let lessons = 0
let help = 0
for (const session of sessions) {
  if (isDemo(session.user.email)) continue
  const moves = session.teachingMoves as Record<string, unknown>
  if (!redo && moves.routines) continue
  const directions = (Array.isArray(moves.directions) ? moves.directions : []) as Quoted[]
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const r = await readRoutines(segments, directions)
  console.log(`\n${session.id}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (!r) {
    console.log('  read failed or too little speech')
    continue
  }
  lessons++
  for (const d of directions) {
    const t = r.directionTypes.find((x) => x.timestampSec === d.timestampSec)?.type ?? 'unread'
    tally[t] = (tally[t] ?? 0) + 1
    console.log(`  direction ${mmss(d.timestampSec)} [${t}] "${d.quote.slice(0, 90)}"`)
  }
  for (const h of r.helpInvites) {
    help++
    console.log(`  help      ${mmss(h.timestampSec)} "${h.quote}"`)
  }
  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { teachingMoves: { ...moves, routines: r } as unknown as Prisma.InputJsonValue } })
  }
}
console.log(`\n${lessons} lessons read${write ? ' (written)' : ' (dry run — nothing written)'}. Directions ${JSON.stringify(tally)}; help invitations ${help}.`)
await prisma.$disconnect()
