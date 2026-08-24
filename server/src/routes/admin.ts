import { Router } from 'express'
import { requireAdmin } from '../lib/auth.ts'
import { prisma } from '../lib/prisma.ts'

export const adminRouter = Router()

adminRouter.use(requireAdmin)

// Aggregate/staff-wide numbers only — deliberately no route exists that
// returns one teacher's individual attempts, responses, or ratings. That's
// the whole point of the "aggregate trends only" admin visibility choice.
adminRouter.get('/overview', async (_req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  const totalTeachers = await prisma.user.count({ where: { role: 'teacher' } })

  const activeUserIds = await prisma.usageLog.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { userId: true },
    distinct: ['userId'],
  })

  // Category lives on the related Scenario, which Prisma can't group by
  // directly, so pull rows and tally by category in JS instead.
  const attempts = await prisma.scenarioAttempt.findMany({ include: { scenario: true } })
  const debriefs = await prisma.debrief.findMany({ where: { category: { not: null } } })

  const categoryTally = new Map<string, number>()
  for (const a of attempts) {
    categoryTally.set(a.scenario.category, (categoryTally.get(a.scenario.category) ?? 0) + 1)
  }
  for (const d of debriefs) {
    if (!d.category) continue
    categoryTally.set(d.category, (categoryTally.get(d.category) ?? 0) + 1)
  }

  const recentRated = attempts.filter((a) => a.rating != null && a.createdAt >= sevenDaysAgo)
  const priorRated = attempts.filter(
    (a) => a.rating != null && a.createdAt >= fourteenDaysAgo && a.createdAt < sevenDaysAgo,
  )
  const goodShare = (rows: typeof attempts) =>
    rows.length === 0 ? null : rows.filter((a) => (a.rating ?? 0) >= 4).length / rows.length

  res.json({
    totalTeachers,
    activeThisWeek: activeUserIds.length,
    categoryTally: Object.fromEntries(categoryTally),
    growth: {
      recentStrongShare: goodShare(recentRated),
      priorStrongShare: goodShare(priorRated),
    },
  })
})
