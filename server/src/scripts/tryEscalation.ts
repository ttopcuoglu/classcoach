import 'dotenv/config'
import { RUNGS, readEscalation } from '../lib/escalation.ts'
import { prisma } from '../lib/prisma.ts'
import type { Segment } from '../lib/audioAnalysis.ts'

// Runs the real escalation read (lib/escalation.ts) against stored lessons and
// prints what came back. Writes nothing.
//
// This exists because the feature's value rests on a claim that is easy to
// assert and easy to get wrong: that it finds the spiral where there is one,
// reports a milder lesson as milder, says nothing on a calm one, and — the
// one that matters most — refuses to call a recording the microphone lost a
// calm room. A single run cannot show any of that, so --runs N prints every
// run and the question "does it say the same thing twice" has an answer.
//
//   tsx src/scripts/tryEscalation.ts --list
//   tsx src/scripts/tryEscalation.ts <sessionId> [<sessionId>...] [--runs 3]

const args = process.argv.slice(2)
const runsFlag = args.indexOf('--runs')
const runs = runsFlag === -1 ? 1 : Math.max(1, Number(args[runsFlag + 1]) || 1)
// Guard the runsFlag === -1 case: args[-1 + 1] is args[0], which silently
// swallowed the first session id when --runs was left off.
const runsValue = runsFlag === -1 ? null : args[runsFlag + 1]
const sessionIds = args.filter((a) => !a.startsWith('--') && a !== runsValue)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

if (args.includes('--list')) {
  const rows = await prisma.audioSession.findMany({
    where: { status: 'analyzed' },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, createdAt: true, durationSec: true, user: { select: { email: true } } },
  })
  for (const r of rows) console.log(`${r.createdAt.toISOString().slice(0, 10)}  ${mmss(r.durationSec ?? 0).padStart(6)}  ${r.id}  ${r.user?.email}`)
  await prisma.$disconnect()
  process.exit(0)
}

for (const id of sessionIds) {
  const session = await prisma.audioSession.findUnique({
    where: { id },
    select: { durationSec: true, createdAt: true, classSummary: true, metricsDetail: true },
  })
  if (!session) { console.log(`${id}: not found`); continue }
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: id },
    orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]

  console.log('\n' + '='.repeat(78))
  console.log(`${session.createdAt.toISOString().slice(0, 10)}  ${mmss(session.durationSec ?? 0)}  ${id}`)
  console.log((session.classSummary ?? '').slice(0, 140))

  for (let run = 1; run <= runs; run++) {
    const read = await readEscalation(segments, session.metricsDetail as never, session.durationSec)
    if (!read) { console.log(`  run ${run}: read failed`); continue }
    console.log(`\n  run ${run}: state=${read.state}  captured=${read.capturedSharePct}%  peakRung=${read.peakRung ?? '—'}`)
    if (read.reason) console.log(`    reason: ${read.reason}`)
    for (const c of read.clusters) {
      console.log(
        `    cluster ${mmss(c.startSec)}-${mmss(c.endSec)}  ${c.bidCount} bids  ` +
        `${c.fromRung} -> ${c.topRung}${c.climbed ? ' (CLIMBED)' : ''}`
      )
      console.log(`      quote: ${c.quote == null ? '(withheld — wording not safe to attribute)' : JSON.stringify(c.quote.slice(0, 95))}`)
    }
    for (const r of read.repeatedAsks) {
      console.log(`    repeated ask at ${mmss(r.timestampSec)}: ${r.quote == null ? '(withheld)' : JSON.stringify(r.quote.slice(0, 90))}`)
    }
    if (read.state === 'confirmed_none') console.log('    nothing like this in what the recording caught, and enough was caught to mean it')
  }
}
console.log(`\nrungs, in order of force: ${RUNGS.join(' < ')}`)
await prisma.$disconnect()
