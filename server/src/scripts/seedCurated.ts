import { CURATED_SCENARIOS } from '../data/curatedScenarios.ts'
import { prisma } from '../lib/prisma.ts'

const existing = await prisma.scenario.findMany({
  where: { source: 'curated' },
  select: { text: true },
})
const existingTexts = new Set(existing.map((s) => s.text))

const toInsert = CURATED_SCENARIOS.filter((s) => !existingTexts.has(s.text))

if (toInsert.length === 0) {
  console.log('Curated scenario bank already seeded — nothing to do.')
} else {
  await prisma.scenario.createMany({
    data: toInsert.map((s) => ({ ...s, source: 'curated' })),
  })
  console.log(`Seeded ${toInsert.length} curated scenario(s).`)
}

await prisma.$disconnect()
