import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { CfuLogEntry, Segment } from '../lib/audioAnalysis.ts'
import { readChecksLoop } from '../lib/checksLoop.ts'
import { prisma } from '../lib/prisma.ts'

// Reads who each check for understanding asked, and whether the teacher
// acted on it (lib/checksLoop.ts), for lessons analyzed before that read.
//
// One model call per lesson, over the lesson's existing checks; nothing else
// changes. Lessons already read are skipped unless --redo. Demo and test
// accounts are skipped, as in backfillPauses.ts.
//
// Prints each check's result and writes nothing unless --write is passed.
// A dry run still makes the model calls.
//
//   tsx src/scripts/backfillChecks.ts
//   tsx src/scripts/backfillChecks.ts --user you@example.com --limit 3
//   tsx src/scripts/backfillChecks.ts --write

const args = process.argv.slice(2)
const write = args.includes('--write')
const redo = args.includes('--redo')
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? null : args[i + 1]
}
const userEmail = flag('--user')
const limit = flag('--limit') ? Number(flag('--limit')) : Infinity

function isDemoAccount(email: string): boolean {
  return email.startsWith('demo.') || email.endsWith('@mapleridge.example') || email.endsWith('@example.com')
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
const WHO_LABEL = { everyone: 'everyone answered', few: 'a few answered', asked_if_understood: 'asked if they understood', not_a_check: 'not a check' }

const sessions = await prisma.audioSession.findMany({
  where: { status: { in: ['analyzed', 'locked'] }, ...(userEmail ? { user: { email: userEmail } } : {}) },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, cfuLog: true, user: { select: { email: true } } },
})

const tally = { lessons: 0, read: 0, failed: 0, checks: 0, unread: 0, everyone: 0, few: 0, asked_if_understood: 0, not_a_check: 0, acted: 0 }

for (const session of sessions) {
  if (tally.read + tally.failed >= limit) break
  if (isDemoAccount(session.user.email)) continue
  const log = (Array.isArray(session.cfuLog) ? session.cfuLog : []) as unknown as CfuLogEntry[]
  if (log.length === 0) continue
  if (!redo && log.every((c) => c.loop !== undefined)) continue
  tally.lessons++
  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({ where: { sessionId: session.id }, orderBy: { startSec: 'asc' } })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text, speakerConfidence: s.speakerConfidence }))

  const base = redo ? log.map(({ loop: _loop, ...rest }) => rest) : log
  const updated = await readChecksLoop(base, segments)
  console.log(`\n${session.id}  ${session.user.email}  ${session.createdAt.toISOString().slice(0, 10)}`)
  if (!updated) {
    tally.failed++
    console.log('  read failed — left as it was')
    continue
  }
  tally.read++
  for (const c of updated) {
    tally.checks++
    const head = `  [${mmss(c.timestampSec)}] ${c.text.slice(0, 70)}`
    if (!c.loop) {
      tally.unread++
      console.log(`${head}\n      — not read`)
      continue
    }
    tally[c.loop.who]++
    if (c.loop.acted) tally.acted++
    const acted = c.loop.acted
      ? `; ${c.loop.acted.how} at ${mmss(c.loop.acted.atSec)}${c.loop.acted.text ? `: "${c.loop.acted.text}"` : ' (words not found in the line)'}`
      : c.loop.who === 'not_a_check'
        ? ''
        : '; no sign of acting on it'
    console.log(`${head}\n      — ${WHO_LABEL[c.loop.who]}${acted}`)
  }
  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { cfuLog: updated as unknown as Prisma.InputJsonValue } })
  }
}

const real = tally.everyone + tally.few + tally.asked_if_understood
console.log(
  `\n${tally.lessons} lessons, ${tally.read} read, ${tally.failed} failed${write ? ' (written)' : ' (dry run — nothing written)'}.` +
    `\n${tally.checks} logged checks: ${tally.not_a_check} not checks, ${tally.unread} not read; of the ${real} real ones, ` +
    `${tally.everyone} everyone answered, ${tally.few} a few answered, ${tally.asked_if_understood} asked if they understood; ` +
    `acted on ${tally.acted} of ${real}.`,
)
await prisma.$disconnect()
