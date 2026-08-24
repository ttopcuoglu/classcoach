import { prisma } from './prisma.ts'

// Best-effort match: prefer category + grade band, then just category, then
// any curated scenario at all. Returns null only if the bank is empty.
export async function getCuratedFallback(category: string, gradeBand: string) {
  const exact = await prisma.scenario.findMany({
    where: { source: 'curated', category, gradeBand },
  })
  if (exact.length > 0) return exact[Math.floor(Math.random() * exact.length)]

  const byCategory = await prisma.scenario.findMany({
    where: { source: 'curated', category },
  })
  if (byCategory.length > 0) return byCategory[Math.floor(Math.random() * byCategory.length)]

  const any = await prisma.scenario.findMany({ where: { source: 'curated' } })
  if (any.length > 0) return any[Math.floor(Math.random() * any.length)]

  return null
}
