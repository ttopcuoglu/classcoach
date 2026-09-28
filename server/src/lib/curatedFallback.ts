import { prisma } from './prisma.ts'

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

// Best-effort match: prefer category + grade band + difficulty, then relax one
// constraint at a time. The focus area is the one constraint never relaxed
// past — a teacher who asked to practice grading must not silently get a
// defiance scenario because generation failed, which is exactly what the old
// "any curated scenario at all" final step would have done once the bank
// covered six areas. Returns null if the area has no curated scenarios, and
// the caller surfaces the failure instead.
export async function getCuratedFallback(
  focusArea: string,
  category: string,
  gradeBand: string,
  difficulty: string,
) {
  const exact = await prisma.scenario.findMany({
    where: { source: 'curated', focusArea, category, gradeBand, difficulty },
  })
  if (exact.length > 0) return pickRandom(exact)

  const byCategoryAndGradeBand = await prisma.scenario.findMany({
    where: { source: 'curated', focusArea, category, gradeBand },
  })
  if (byCategoryAndGradeBand.length > 0) return pickRandom(byCategoryAndGradeBand)

  const byCategory = await prisma.scenario.findMany({
    where: { source: 'curated', focusArea, category },
  })
  if (byCategory.length > 0) return pickRandom(byCategory)

  const byGradeBand = await prisma.scenario.findMany({
    where: { source: 'curated', focusArea, gradeBand },
  })
  if (byGradeBand.length > 0) return pickRandom(byGradeBand)

  const byArea = await prisma.scenario.findMany({ where: { source: 'curated', focusArea } })
  if (byArea.length > 0) return pickRandom(byArea)

  return null
}
