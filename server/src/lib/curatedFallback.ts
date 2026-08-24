import { prisma } from './prisma.ts'

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// Best-effort match: prefer category + grade band + difficulty, then relax
// one constraint at a time, then any curated scenario at all. Returns null
// only if the bank is empty.
export async function getCuratedFallback(category: string, gradeBand: string, difficulty: string) {
  const exact = await prisma.scenario.findMany({
    where: { source: 'curated', category, gradeBand, difficulty },
  })
  if (exact.length > 0) return pickRandom(exact)

  const byCategoryAndGradeBand = await prisma.scenario.findMany({
    where: { source: 'curated', category, gradeBand },
  })
  if (byCategoryAndGradeBand.length > 0) return pickRandom(byCategoryAndGradeBand)

  const byCategory = await prisma.scenario.findMany({
    where: { source: 'curated', category },
  })
  if (byCategory.length > 0) return pickRandom(byCategory)

  const any = await prisma.scenario.findMany({ where: { source: 'curated' } })
  if (any.length > 0) return pickRandom(any)

  return null
}
