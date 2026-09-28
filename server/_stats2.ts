import 'dotenv/config'
import { prisma } from './src/lib/prisma.ts'

const orgs = await prisma.organization.findMany({ select: { id: true, name: true, _count: { select: { users: true } } } })
console.log('Organizations:', orgs)

const users = await prisma.user.findMany({
  select: { id: true, email: true, organizationId: true, plan: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
})
const demoPatterns = ['example.com', 'mapleridge.example', 'demo.teacher@wivoza.com', 'demo.principal@wivoza.com']
const nonDemo = users.filter((u) => !demoPatterns.some((p) => u.email.includes(p)))
console.log(`\n${nonDemo.length} non-demo-pattern users:`)
for (const u of nonDemo) {
  const sessions = await prisma.audioSession.count({ where: { userId: u.id } })
  const last30 = await prisma.audioSession.count({ where: { userId: u.id, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } })
  console.log(`- created ${u.createdAt.toISOString().slice(0, 10)}, org=${u.organizationId ? 'yes' : 'no'}, plan=${u.plan}, totalSessions=${sessions}, last30d=${last30}`)
}

await prisma.$disconnect()
