import { CURATED_SCENARIOS } from '../data/curatedScenarios.ts'
import { prisma } from '../lib/prisma.ts'

const existing = await prisma.scenario.findMany({
  where: { source: 'curated' },
  select: { id: true, text: true },
})
const existingByText = new Map(existing.map((s) => [s.text, s.id]))

let created = 0
let updated = 0

for (const scenario of CURATED_SCENARIOS) {
  const existingId = existingByText.get(scenario.text)
  if (existingId) {
    await prisma.scenario.update({
      where: { id: existingId },
      data: { category: scenario.category, gradeBand: scenario.gradeBand, difficulty: scenario.difficulty },
    })
    updated++
  } else {
    await prisma.scenario.create({ data: { ...scenario, source: 'curated' } })
    created++
  }
}

console.log(`Curated scenario bank: ${created} created, ${updated} updated.`)

await prisma.$disconnect()
