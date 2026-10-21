import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { CfuLogEntry, Segment } from '../lib/audioAnalysis.ts'
import { readCheckKinds } from '../lib/checkKinds.ts'
import { prisma } from '../lib/prisma.ts'

// Reads what each check for understanding asked students for
// (lib/checkKinds.ts) on lessons analyzed before that read. One model call
// per lesson with checks; nothing else changes. Demo and test accounts are
// skipped. Prints each check and writes nothing unless --write is passed; a
// dry run still makes the model calls.
//
//   tsx src/scripts/backfillCheckKinds.ts [--redo] [--write]

const write = process.argv.includes('--write')
const redo = process.argv.includes('--redo')
const isDemo = (email: string) => email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] } },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, cfuLog: true, user: { select: { email: true } } },
})
const tally: Record<string, number> = {}
let lessons = 0
let failed = 0
for (const session of sessions) {
  if (isDemo(session.user.email)) continue
  const log = (Array.isArray(session.cfuLog) ? session.cfuLog : []) as unknown as CfuLogEntry[]
  if (log.length === 0) continue
  if (!redo && log.every((c) => c.kind)) continue
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))
  const updated = await readCheckKinds(log, segments)
  console.log(`\n${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (!updated) {
    failed++
    console.log('  read failed — left as it was')
    continue
  }
  lessons++
  for (const c of updated) {
    tally[c.kind ?? 'unread'] = (tally[c.kind ?? 'unread'] ?? 0) + 1
    console.log(`  ${mmss(c.timestampSec)}  [${c.kind ?? 'unread'}]  "${c.text.slice(0, 100)}"`)
  }
  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { cfuLog: updated as unknown as Prisma.InputJsonValue } })
  }
}
console.log(`\n${lessons} lessons read, ${failed} failed${write ? ' (written)' : ' (dry run — nothing written)'}.\n${JSON.stringify(tally)}`)
await prisma.$disconnect()
