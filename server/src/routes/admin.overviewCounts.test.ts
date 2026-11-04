// The School Admin Dashboard's "X of Y teachers" numbers.
//
// A school with one teacher read "2 of 1 teachers (200%) used Wivoza in this
// period" because the active, returning and weekly counts took everyone in the
// school who had a UsageLog row, the principal included, while the
// denominator counted teachers only. This seeds exactly that school and checks
// every count shown against totalTeachers comes from teachers.
//
// Runs against a throwaway in-memory Postgres (PGlite), never a real one —
// same harness as schoolPriorities.privacy.test.ts.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// Before anything can load server/.env (which points at production): a dead
// local address, replaced with the throwaway database once it is up. dotenv
// never overrides a variable that is already set.
process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_overview_dummy'
process.env.JWT_SECRET ??= 'overview-test-only'
// The in-memory database's socket takes one connection at a time.
process.env.DATABASE_POOL_MAX = '1'
process.env.ANTHROPIC_API_KEY ??= 'overview-test-only'

const SERVER_SRC = join(import.meta.dirname, '..')
const DAY_MS = 24 * 60 * 60 * 1000

type Ctx = { base: string; stop: () => Promise<void>; admin: string; superadmin: string; org: string }
let ctx: Ctx | null = null
let skipReason: string | null = null

before(async () => {
  let PGlite: typeof import('@electric-sql/pglite').PGlite
  let PGLiteSocketServer: typeof import('@electric-sql/pglite-socket').PGLiteSocketServer
  try {
    ;({ PGlite } = await import('@electric-sql/pglite'))
    ;({ PGLiteSocketServer } = await import('@electric-sql/pglite-socket'))
  } catch {
    skipReason = 'PGlite is not installed here'
    return
  }

  const db = await PGlite.create()
  const dir = join(SERVER_SRC, '..', 'prisma', 'migrations')
  for (const name of readdirSync(dir).filter((n) => /^\d{14}_/.test(n)).sort()) {
    await db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8'))
  }
  const port = 55000 + Math.floor(Math.random() * 1000)
  const socket = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await socket.start()
  const abandon = async (error: unknown) => {
    await socket.stop().catch(() => {})
    await db.close().catch(() => {})
    throw error
  }
  try {
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
    assert.match(process.env.DATABASE_URL, /@127\.0\.0\.1:/, 'this test only ever runs against a local throwaway database')

    const express = (await import('express')).default
    const { prisma } = await import('../lib/prisma.ts')
    const { adminRouter } = await import('./admin.ts')

    const org = await prisma.organization.create({ data: { name: 'One Teacher School', joinCode: 'ONE1' } })
    const admin = await prisma.user.create({
      data: { email: 'principal@test.example', name: 'Pat Principal', role: 'org_admin', organizationId: org.id },
    })
    const superadmin = await prisma.user.create({ data: { email: 'staff@test.example', name: 'Wivoza Staff', role: 'superadmin' } })
    const teacher = await prisma.user.create({
      data: { email: 'teacher@test.example', name: 'Maria Rivera', role: 'teacher', organizationId: org.id },
    })

    // Both the teacher and the principal used Wivoza this week and the week
    // before, and both tried Communication Coach's Write tool.
    const now = Date.now()
    for (const userId of [teacher.id, admin.id]) {
      await prisma.usageLog.create({ data: { userId, action: 'parent_message', createdAt: new Date(now - 1 * DAY_MS) } })
      await prisma.usageLog.create({ data: { userId, action: 'parent_message', createdAt: new Date(now - 8 * DAY_MS) } })
      await prisma.parentMessage.create({ data: { userId, tone: 'warm', draftText: 'Hello' } })
    }

    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      const userId = req.header('x-test-user')
      if (userId) req.user = { userId, role: req.header('x-test-role') ?? 'teacher' }
      next()
    })
    app.use('/api/admin', adminRouter)
    const server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const { port: httpPort } = server.address() as AddressInfo

    ctx = {
      base: `http://127.0.0.1:${httpPort}`,
      stop: async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await prisma.$disconnect()
        await socket.stop()
        await db.close()
      },
      admin: admin.id,
      superadmin: superadmin.id,
      org: org.id,
    }
  } catch (error) {
    await abandon(error)
  }
})

after(async () => {
  await ctx?.stop()
})

async function overview(as: { id: string; role: string }, query = '') {
  const res = await fetch(`${ctx!.base}/api/admin/overview${query}`, {
    headers: { 'x-test-user': as.id, 'x-test-role': as.role },
  })
  assert.equal(res.status, 200)
  return res.json()
}

function assertTeachersOnly(o: Record<string, any>, where: string) {
  assert.equal(o.totalTeachers, 1, `${where}: one teacher`)
  assert.equal(o.activeThisWeek, 1, `${where}: 1 of 1 active, not 2 of 1`)
  assert.equal(o.returningUsers, 1, `${where}: 1 of 1 returning`)
  const lastTwo = o.weeklyActivity.slice(-2).map((w: { activeCount: number }) => w.activeCount)
  assert.deepEqual(lastTwo, [1, 1], `${where}: weekly trend counts teachers only`)
  for (const w of o.weeklyActivity) assert.ok(w.activeCount <= o.totalTeachers, `${where}: a week over 100%`)
  assert.equal(o.featureAdoption.communications, 1, `${where}: feature adoption counts teachers only`)
  assert.equal(o.communicationsByTool.write.teachers, 1, `${where}: per-tool teachers count teachers only`)
  // The principal's own use still shows up as activity, just not as a teacher.
  assert.equal(o.communicationsByTool.write.activity, 2, `${where}: activity totals unchanged`)
}

test('a school with one teacher and one admin who both used Wivoza reads 1 of 1', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  assertTeachersOnly(await overview({ id: ctx.admin, role: 'org_admin' }), 'as the school admin')
  assertTeachersOnly(
    await overview({ id: ctx.superadmin, role: 'superadmin' }, `?organizationId=${ctx.org}`),
    'as Wivoza staff viewing the school',
  )
})
