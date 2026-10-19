import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import { factsText, headlineFacts, writeHeadline } from '../lib/summaryHeadline.ts'
import { prisma } from '../lib/prisma.ts'

// Writes the Summary headline (lib/summaryHeadline.ts) for lessons analyzed
// before it, stored with the teaching moves. One or two model calls per
// lesson; nothing else changes. Demo and test accounts are skipped. Prints
// results and writes nothing unless --write is passed; a dry run still makes
// the calls.
//
//   tsx src/scripts/backfillHeadline.ts [--redo] [--write] [--facts]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
const showFacts = process.argv.includes('--facts')
const isDemo = (email: string) => email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, teachingMoves: { not: Prisma.DbNull } },
  orderBy: { createdAt: 'desc' },
  select: {
    id: true,
    createdAt: true,
    durationSec: true,
    teacherTalkPct: true,
    questionLog: true,
    teachingMoves: true,
    metricsDetail: true,
    lessonContent: true,
    user: { select: { email: true } },
  },
})
let written = 0
let empty = 0
for (const session of sessions) {
  if (isDemo(session.user.email)) continue
  const moves = session.teachingMoves as Record<string, unknown>
  if (!redo && moves.headline) continue
  const facts = headlineFacts(session)
  console.log(`\n${session.id}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (showFacts) console.log(factsText(facts).replace(/^/gm, '  · '))
  const headline = await writeHeadline(facts)
  if (!headline) {
    empty++
    console.log('  (no headline — the lesson summary stands in)')
    continue
  }
  written++
  console.log(`  ${headline.text}`)
  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { teachingMoves: { ...moves, headline } as unknown as Prisma.InputJsonValue } })
  }
}
console.log(`\n${written} headlines${write ? ' written' : ' (dry run — nothing written)'}, ${empty} without.`)
await prisma.$disconnect()
