import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'

// The "Not right?" flags teachers left on Insights quotes — the eval set for
// the reads that choose quotes. Read-only.
//
// Each flag prints with the words as the teacher saw them, the transcript line
// they came from as it is NOW, and the lines either side, so a reviewer can
// tell a mis-transcription from a wrong speaker from a wrong reading.
//
//   tsx src/scripts/showQuoteFlags.ts
//   tsx src/scripts/showQuoteFlags.ts --finding higher_order_questions
//   tsx src/scripts/showQuoteFlags.ts --json > flags.json

const args = process.argv.slice(2)
const findingFlag = args.indexOf('--finding')
const finding = findingFlag === -1 ? null : args[findingFlag + 1]
const asJson = args.includes('--json')

const flags = await prisma.quoteFlag.findMany({
  where: finding ? { findingKey: finding } : {},
  orderBy: { createdAt: 'desc' },
})

const rows = []
for (const f of flags) {
  const line = await prisma.transcriptSegment.findUnique({ where: { id: f.segmentId } })
  const around = line
    ? await prisma.transcriptSegment.findMany({
        where: { sessionId: f.sessionId, startSec: { gte: line.startSec - 20, lte: line.endSec + 20 } },
        orderBy: { startSec: 'asc' },
        select: { speakerLabel: true, startSec: true, text: true },
      })
    : []
  rows.push({
    flaggedAt: f.createdAt.toISOString(),
    sessionId: f.sessionId,
    findingKey: f.findingKey,
    shown: f.quote,
    reason: f.reason,
    line: line ? { speaker: line.speakerLabel, startSec: line.startSec, text: line.text } : null,
    around,
  })
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  console.log(`${rows.length} flag(s)${finding ? ` on ${finding}` : ''}\n`)
  for (const r of rows) {
    console.log(`${r.flaggedAt.slice(0, 10)}  ${r.sessionId}  ${r.findingKey}`)
    console.log(`  shown:  "${r.shown}"`)
    if (r.reason) console.log(`  reason: ${r.reason}`)
    if (!r.line) console.log('  line:   no longer in the transcript')
    for (const a of r.around) {
      const m = Math.floor(a.startSec / 60)
      const s = String(Math.floor(a.startSec % 60)).padStart(2, '0')
      console.log(`  ${m}:${s} ${a.speakerLabel.padEnd(7)} ${a.text}`)
    }
    console.log('')
  }
}
await prisma.$disconnect()
