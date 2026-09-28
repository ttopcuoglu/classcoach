import 'dotenv/config'
import { prisma } from './src/lib/prisma.ts'

const totalUsers = await prisma.user.count()
const demoLikeEmails = ['%example.com%', '%mapleridge.example%', '%demo.%']
const realUsers = await prisma.user.count({
  where: { AND: demoLikeEmails.map((e) => ({ NOT: { email: { contains: e.replace(/%/g, '') } } })) },
})

const now = new Date()
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

const sessionsThisMonth = await prisma.audioSession.count({ where: { createdAt: { gte: startOfMonth } } })
const sessionsLast30d = await prisma.audioSession.count({ where: { createdAt: { gte: thirtyDaysAgo } } })
const analyzedLast30d = await prisma.audioSession.count({ where: { createdAt: { gte: thirtyDaysAgo }, status: { in: ['analyzed', 'locked'] } } })

const distinctRecordersLast30d = await prisma.audioSession.findMany({
  where: { createdAt: { gte: thirtyDaysAgo } },
  select: { userId: true },
  distinct: ['userId'],
})

// Per-user session counts in the last 30 days, to see the real distribution
// (0 / 1 / 2-3 / 4+), not just an average.
const grouped = await prisma.audioSession.groupBy({
  by: ['userId'],
  where: { createdAt: { gte: thirtyDaysAgo } },
  _count: { id: true },
})
const buckets = { '1': 0, '2-3': 0, '4+': 0 }
for (const g of grouped) {
  const n = g._count.id
  if (n === 1) buckets['1']++
  else if (n <= 3) buckets['2-3']++
  else buckets['4+']++
}

const plusUsers = await prisma.user.count({ where: { plan: 'plus' } })
const orgUsers = await prisma.user.count({ where: { organizationId: { not: null } } })

console.log({
  totalUsers,
  realUsers,
  plusUsers,
  orgUsers,
  sessionsThisMonth,
  sessionsLast30d,
  analyzedLast30d,
  distinctRecordersLast30d: distinctRecordersLast30d.length,
  bucketsAmongRecordersLast30d: buckets,
})

await prisma.$disconnect()
