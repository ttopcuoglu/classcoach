import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { readEscalation } from '../lib/escalation.ts'
import { prisma } from '../lib/prisma.ts'

// Fills in the escalation read for reports analyzed before it existed.
//
// Without this, every lesson a teacher already has shows nothing in "Did your
// asks hold?" — correctly, because absent means "not looked at" rather than
// "nothing happened", but it means the feature is invisible on exactly the
// lessons a teacher would want to check it against.
//
// Reads the stored transcript; no re-recording and no re-transcription. Prints
// what it would write and changes nothing unless --write is passed, in the
// same shape as recomputeAnalysis.ts.
//
//   tsx src/scripts/backfillEscalation.ts --user you@example.com
//   tsx src/scripts/backfillEscalation.ts --user you@example.com --write
//   tsx src/scripts/backfillEscalation.ts --all --write
//
// --force re-reads sessions that already have one, for when the prompt or the
// thresholds change.

const args = process.argv.slice(2)
const write = args.includes('--write')
const all = args.includes('--all')
const force = args.includes('--force')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]

if (!all && !userEmail) {
  console.error('Pass --user <email> or --all.')
  process.exit(1)
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const sessions = await prisma.audioSession.findMany({
  where: {
    status: 'analyzed',
    ...(userEmail ? { user: { email: userEmail } } : {}),
    // Prisma distinguishes SQL NULL from JSON null; the column being unset
    // is the former, and plain `null` here is a type error rather than a
    // filter that matches nothing silently.
    ...(force ? {} : { escalation: { equals: Prisma.DbNull } }),
  },
  orderBy: { createdAt: 'desc' },
  select: { id: true, createdAt: true, durationSec: true, metricsDetail: true, escalation: true },
})

console.log(`${sessions.length} session(s) to read${write ? '' : ' (dry run — nothing will be written)'}\n`)

const tally = { found: 0, confirmed_none: 0, not_measurable: 0, failed: 0 }

for (const session of sessions) {
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: session.id },
    orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]

  const read = await readEscalation(segments, session.metricsDetail as never, session.durationSec)
  const date = session.createdAt.toISOString().slice(0, 10)
  if (!read) {
    tally.failed++
    console.log(`${date}  ${session.id}  READ FAILED — left untouched`)
    continue
  }
  tally[read.state]++

  const top = read.clusters[0]
  const detail = top
    ? `${top.fromRung} -> ${top.topRung}${top.climbed ? ' (climbed)' : ''} at ${mmss(top.startSec)}`
    : read.repeatedAsks.length > 0
      ? `repeated ask at ${mmss(read.repeatedAsks[0].timestampSec)}`
      : '—'
  console.log(`${date}  ${String(read.capturedSharePct ?? 0).padStart(3)}% captured  ${read.state.padEnd(15)} ${detail}`)

  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { escalation: read } })
  }
}

console.log(
  `\nfound ${tally.found} · nothing to report ${tally.confirmed_none} · too little captured to tell ${tally.not_measurable} · failed ${tally.failed}`,
)
if (!write) console.log('Nothing was written. Re-run with --write to save.')
await prisma.$disconnect()
