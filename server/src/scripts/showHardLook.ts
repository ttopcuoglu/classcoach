import 'dotenv/config'
import { prisma } from '../lib/prisma.ts'

// Prints the Hard Looks teachers have actually been shown, which is how the
// first round's defects were found — a talk finding with no quote behind it, a
// questioning complaint filed under Clarity & Content, and a garbled
// transcript line quoted back as the teacher's own words.
//
//   tsx src/scripts/showHardLook.ts

// Filtered in JS rather than in the query: Prisma's Json filters cannot
// express "is not null" without the DbNull/JsonNull distinction, and this is
// an inspection script reading a handful of rows.
const rows = (
  await prisma.audioSession.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 40,
    select: { id: true, durationSec: true, hardLook: true, rubricLens: true },
  })
)
  .filter((r) => r.hardLook != null)
  .slice(0, 5)
if (rows.length === 0) console.log('no session has a hardLook stored')
for (const r of rows) {
  const hl = r.hardLook as any
  console.log(`\n=== ${r.id} · ${Math.round((r.durationSec ?? 0) / 60)}min · generated ${hl.generatedAt}`)
  console.log(`critiques: ${hl.critiques.length}   cleared: ${hl.cleared.length}`)
  for (const c of hl.critiques) {
    console.log(`\n  [${c.section}] ${c.headline}`)
    console.log(`    case: ${c.critique}`)
    console.log(`    cost: ${c.likelyCost}`)
    console.log(`    next: ${c.nextStep || '(none)'}`)
    console.log(`    quotes: ${c.evidence.length}`)
    for (const e of c.evidence) console.log(`      · ${e.kind}: "${e.text.slice(0, 80)}"`)
  }
  for (const c of hl.cleared) console.log(`\n  [${c.section}] CLEAR — ${c.reason}`)
  const rl = r.rubricLens as any
  if (rl) console.log(`\n  (rubric lens on same session: ${rl.components.length} components, ${rl.components.filter((c: any) => c.nextStep).length} with a next step)`)
}
await prisma.$disconnect()
