import 'dotenv/config'
import { Prisma } from '../generated/prisma/client.ts'
import type { Segment } from '../lib/audioAnalysis.ts'
import { countMoves, readTeachingMoves } from '../lib/teachingMoves.ts'
import { prisma } from '../lib/prisma.ts'

// Fills in the teaching-moves read for reports analyzed before it existed.
//
// Without this the seven new sections are empty on every lesson a teacher
// already has — correct, since absent means "not read" rather than "none
// found", but it means the work is invisible on exactly the lessons they
// remember teaching.
//
// Reads the stored transcript; no re-recording and no re-transcription. One
// model call per lesson. Prints what it would write and changes nothing
// unless --write is passed, in the same shape as backfillEscalation.ts.
//
//   tsx src/scripts/backfillTeachingMoves.ts --user you@example.com
//   tsx src/scripts/backfillTeachingMoves.ts --user you@example.com --write
//   tsx src/scripts/backfillTeachingMoves.ts --all --write
//
// --force re-reads lessons that already have one, for when the prompt changes.

const args = process.argv.slice(2)
const write = args.includes('--write')
const all = args.includes('--all')
const force = args.includes('--force')
const userFlag = args.indexOf('--user')
const userEmail = userFlag === -1 ? null : args[userFlag + 1]
const limitFlag = args.indexOf('--limit')
const limit = limitFlag === -1 ? undefined : Number(args[limitFlag + 1]) || undefined

if (!all && !userEmail) {
  console.error('Pass --user <email> or --all.')
  process.exit(1)
}

/// Below this there is not enough lesson to read. The same floor the read
/// itself applies, checked here so a doomed call is never made.
const MIN_DURATION_SEC = 300

const sessions = await prisma.audioSession.findMany({
  where: {
    status: 'analyzed',
    durationSec: { gte: MIN_DURATION_SEC },
    ...(userEmail ? { user: { email: userEmail } } : {}),
    ...(force ? {} : { teachingMoves: { equals: Prisma.DbNull } }),
  },
  orderBy: { createdAt: 'desc' },
  ...(limit ? { take: limit } : {}),
  select: { id: true, createdAt: true, durationSec: true, user: { select: { email: true } } },
})

console.log(`${sessions.length} lesson(s) to read${write ? '' : ' (dry run — nothing will be written)'}\n`)

const tally = { read: 0, nothing: 0, failed: 0 }
let moments = 0

for (const session of sessions) {
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: session.id },
    orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]

  const moves = await readTeachingMoves(segments)
  const date = session.createdAt.toISOString().slice(0, 10)
  if (!moves) {
    tally.nothing++
    console.log(`${date}  nothing came back — left untouched`)
    continue
  }
  tally.read++
  moments += countMoves(moves)
  const parts = [
    `self-answered ${moves.selfAnswered.length}`,
    `questions ${moves.questionKinds.length}`,
    `directions ${moves.directions.length}`,
    `explanation ${moves.explanations.length}`,
    `revision ${moves.revisionPrompts.length}`,
    `invitations ${moves.invitations.length}`,
    `redirections ${moves.redirections.length}`,
    `connections ${moves.connections.length}`,
  ]
  console.log(`${date}  ${String(countMoves(moves)).padStart(3)} moments  ${parts.join(' · ')}`)
  // The one worth eyeballing: a direction that named none of the four is the
  // sharpest thing this read produces, and the easiest to get wrong.
  const bare = moves.directions.filter((d) => d.parts.length === 0)
  if (bare.length > 0) {
    console.log(`      named none of the four: ${bare.map((d) => JSON.stringify(d.quote.slice(0, 60))).join(', ')}`)
  }

  if (write) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { teachingMoves: moves } })
  }
}

console.log(`\nread ${tally.read} · nothing came back ${tally.nothing} · failed ${tally.failed} · ${moments} moments in total`)
if (!write) console.log('Nothing was written. Re-run with --write to save.')
await prisma.$disconnect()
