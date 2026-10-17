import 'dotenv/config'
import type { Segment } from '../lib/audioAnalysis.ts'
import { countMoves, readTeachingMoves } from '../lib/teachingMoves.ts'
import { prisma } from '../lib/prisma.ts'

// Runs the teaching-moves read against real stored lessons and prints what
// came back. Writes nothing.
//
// Here because the value of eight new categories rests on whether the quotes
// are real and the labels are right, and only a teacher reading their own
// lesson can tell. --runs N prints each run, so "does it say the same thing
// twice" has an answer from data rather than from the prompt's intentions.
//
//   tsx src/scripts/tryTeachingMoves.ts <sessionId> [<sessionId>...] [--runs 2]

const args = process.argv.slice(2)
const runsFlag = args.indexOf('--runs')
const runs = runsFlag === -1 ? 1 : Math.max(1, Number(args[runsFlag + 1]) || 1)
const runsValue = runsFlag === -1 ? null : args[runsFlag + 1]
const ids = args.filter((a) => !a.startsWith('--') && a !== runsValue)
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

for (const id of ids) {
  const s = await prisma.audioSession.findUnique({ where: { id }, select: { createdAt: true, classSummary: true } })
  const segments = (await prisma.transcriptSegment.findMany({
    where: { sessionId: id },
    orderBy: { startSec: 'asc' },
    select: { startSec: true, endSec: true, speakerLabel: true, text: true },
  })) as Segment[]
  console.log('\n' + '='.repeat(78))
  console.log(`${s?.createdAt.toISOString().slice(0, 10)}  ${id}`)
  console.log((s?.classSummary ?? '').slice(0, 130))

  for (let run = 1; run <= runs; run++) {
    const m = await readTeachingMoves(segments)
    if (!m) { console.log(`  run ${run}: nothing came back`); continue }
    console.log(`\n  run ${run} — ${countMoves(m)} moments`)
    const show = (label: string, rows: { quote: string; timestampSec: number }[], attr?: (r: never) => string) => {
      if (rows.length === 0) return
      console.log(`  ${label} (${rows.length})`)
      for (const r of rows.slice(0, 4)) {
        const a = attr ? ` [${attr(r as never)}]` : ''
        console.log(`     ${mmss(r.timestampSec)}${a} ${JSON.stringify(r.quote.slice(0, 92))}`)
      }
    }
    show('SELF-ANSWERED', m.selfAnswered)
    show('QUESTION KINDS', m.questionKinds, (r: { kind: string }) => r.kind)
    show('DIRECTIONS', m.directions, (r: { parts: string[] }) => (r.parts.length ? r.parts.join('+') : 'names nothing'))
    show('EXPLANATION', m.explanations, (r: { kind: string }) => r.kind)
    show('REVISION PROMPTS', m.revisionPrompts)
    show('INVITATIONS', m.invitations)
    show('REDIRECTIONS', m.redirections, (r: { clarity: string }) => r.clarity)
    show('CONNECTIONS', m.connections, (r: { kind: string }) => r.kind)
  }
}
await prisma.$disconnect()
