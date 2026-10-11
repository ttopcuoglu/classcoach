import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'
for (const id of process.argv.slice(2)) {
  const s = await prisma.audioSession.findUnique({ where: { id }, select: { studentTalkFocus: true } })
  const f = s?.studentTalkFocus as {
    classified: number; onTopic: number; procedural: number; offTopic: number; unclear: number
    examples: { kind: string; timestampSec: number; text: string }[]
  } | null
  if (!f) { console.log(`${id}: null (not measured)`); continue }
  console.log(`\n${id}`)
  console.log(`  CARD SHOWS: About the lesson ${f.onTopic} · About how to do the work ${f.procedural} · Too unclear ${f.unclear}`)
  console.log(`  (offTopic=${f.offTopic} stored but NOT displayed as a count)`)
  const other = f.examples.filter((e) => e.kind === 'off_topic')
  console.log(`  "Turns that looked like something else" quotes: ${other.length}`)
  for (const e of other) console.log(`    · ${Math.floor(e.timestampSec / 60)}:${String(Math.round(e.timestampSec % 60)).padStart(2, '0')} "${e.text.slice(0, 70)}"`)
}
await prisma.$disconnect()
