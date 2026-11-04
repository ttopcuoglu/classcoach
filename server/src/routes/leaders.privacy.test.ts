// Leader's Corner: who can open it, which scenarios each level gets, and that
// a leader's practice never reaches an admin route — tested against a
// throwaway in-memory Postgres (PGlite), never a real one. Same harness as
// schoolPriorities.privacy.test.ts. Nothing here calls Anthropic: every
// request that would reach the coach is refused before it.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// Before anything can load server/.env (which points at production).
process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_privacy_dummy'
process.env.JWT_SECRET ??= 'privacy-test-only'
process.env.DATABASE_POOL_MAX = '1'
process.env.ANTHROPIC_API_KEY ??= 'privacy-test-only'

const SERVER_SRC = join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(join(SERVER_SRC, rel), 'utf8')

const MARKER = 'LEADER-PRACTICE-MARKER'

test('admin code never reads a leader’s practice', () => {
  const admin = read('routes/admin.ts')
  assert.ok(!/leaderAttempt|LeaderAttempt/.test(admin), 'admin.ts must not touch LeaderAttempt')
  // Every usage-log read in admin.ts leaves Leader's Corner out.
  const reads = [...admin.matchAll(/prisma\.usageLog\.(count|findMany|groupBy)\(\{([\s\S]*?)\n {2,4}\}\)/g)]
  assert.equal(reads.length, admin.match(/prisma\.usageLog\./g)?.length, 'the walk found every usage-log read')
  assert.ok(reads.length >= 6)
  for (const m of reads) {
    assert.ok(m[2].includes('NOT_LEADER_PRACTICE'), `usageLog.${m[1]} in admin.ts must exclude leader actions`)
  }
})

test('every level has scenarios, and every scenario id is unique', async () => {
  const { LEADER_LEVELS } = await import('../lib/leaderLevels.ts')
  const { LEADER_SCENARIOS, scenariosForLevel } = await import('../lib/leaderScenarios.ts')
  for (const level of LEADER_LEVELS) assert.ok(scenariosForLevel(level.value).length >= 4, `${level.value} has scenarios`)
  assert.equal(new Set(LEADER_SCENARIOS.map((s) => s.id)).size, LEADER_SCENARIOS.length)
})

type Ctx = {
  base: string
  stop: () => Promise<void>
  ids: { org: string; admin: string; superadmin: string; teacher: string; assistant: string; district: string }
}
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
    const { leadersRouter } = await import('./leaders.ts')

    const org = await prisma.organization.create({ data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE2' } })
    const admin = await prisma.user.create({ data: { email: 'principal@test.example', role: 'org_admin', organizationId: org.id, leaderLevel: 'building' } })
    const superadmin = await prisma.user.create({ data: { email: 'staff@test.example', role: 'superadmin' } })
    const teacher = await prisma.user.create({ data: { email: 'teacher@test.example', role: 'teacher', organizationId: org.id, jobTitle: 'Principal' } })
    const assistant = await prisma.user.create({ data: { email: 'ap@test.example', role: 'teacher', organizationId: org.id, leaderLevel: 'assistant' } })
    const district = await prisma.user.create({ data: { email: 'super@test.example', role: 'teacher', leaderLevel: 'district' } })

    // A leader's private practice, and the only usage the AP has ever logged.
    await prisma.leaderAttempt.create({
      data: { userId: assistant.id, level: 'assistant', source: 'own', scenarioText: MARKER, responseText: MARKER, feedback: MARKER },
    })
    await prisma.usageLog.create({ data: { userId: assistant.id, action: 'leader_feedback' } })

    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      const userId = req.header('x-test-user')
      if (userId) req.user = { userId, role: req.header('x-test-role') ?? 'teacher' }
      next()
    })
    app.use('/api/admin', adminRouter)
    app.use('/api/leaders', leadersRouter)
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
      ids: { org: org.id, admin: admin.id, superadmin: superadmin.id, teacher: teacher.id, assistant: assistant.id, district: district.id },
    }
  } catch (error) {
    await abandon(error)
  }
})

after(async () => {
  await ctx?.stop()
})

async function call(path: string, as: { id: string; role: string }, init: RequestInit = {}) {
  const res = await fetch(`${ctx!.base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-test-user': as.id, 'x-test-role': as.role, ...(init.headers ?? {}) },
  })
  return { status: res.status, text: await res.text() }
}

test('no level, no Leader’s Corner — whatever the job title says', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  // This teacher calls themself a Principal; only a superadmin's assignment counts.
  const teacher = { id: ctx.ids.teacher, role: 'teacher' }
  assert.equal((await call('/api/leaders/scenarios', teacher)).status, 403)
  assert.equal((await call('/api/leaders/attempts', teacher)).status, 403)
  const post = await call('/api/leaders/attempts', teacher, { method: 'POST', body: JSON.stringify({ situationText: 'A parent is upset about a schedule.' }) })
  assert.equal(post.status, 403)
})

test('each level gets only its own scenarios, and cannot open another level’s', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const { scenariosForLevel } = await import('../lib/leaderScenarios.ts')
  const ap = { id: ctx.ids.assistant, role: 'teacher' }
  const list = JSON.parse((await call('/api/leaders/scenarios', ap)).text) as { level: { value: string }; scenarios: { id: string }[] }
  assert.equal(list.level.value, 'assistant')
  const mine = new Set(scenariosForLevel('assistant').map((s) => s.id))
  assert.equal(list.scenarios.length, mine.size)
  for (const s of list.scenarios) assert.ok(mine.has(s.id), `${s.id} is an assistant scenario`)

  // A superintendent's board scenario, asked for by id: not found, before any coach call.
  const foreign = await call('/api/leaders/attempts', ap, { method: 'POST', body: JSON.stringify({ scenarioId: 'district-budget-cut', responseText: 'I would explain.' }) })
  assert.equal(foreign.status, 404)
})

test('a leader sees only their own practice', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const ap = { id: ctx.ids.assistant, role: 'teacher' }
  const district = { id: ctx.ids.district, role: 'teacher' }
  assert.ok((await call('/api/leaders/attempts', ap)).text.includes(MARKER))
  const others = await call('/api/leaders/attempts', district)
  assert.equal(others.status, 200)
  assert.ok(!others.text.includes(MARKER))
  const id = (JSON.parse((await call('/api/leaders/attempts', ap)).text) as { id: string }[])[0].id
  assert.equal((await call(`/api/leaders/attempts/${id}`, district)).status, 404)
  assert.equal((await call(`/api/leaders/attempts/${id}`, district, { method: 'PATCH', body: JSON.stringify({ saved: true }) })).status, 404)
})

test('only a superadmin assigns a level, and it applies on the next request', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const admin = { id: ctx.ids.admin, role: 'org_admin' }
  const staff = { id: ctx.ids.superadmin, role: 'superadmin' }
  const teacher = { id: ctx.ids.teacher, role: 'teacher' }

  // A school admin's member edit ignores it; the platform edit refuses them.
  await call(`/api/admin/members/${ctx.ids.teacher}`, admin, { method: 'PATCH', body: JSON.stringify({ leaderLevel: 'building' }) })
  assert.equal((await call('/api/leaders/scenarios', teacher)).status, 403)
  assert.equal((await call(`/api/admin/users/${ctx.ids.teacher}`, admin, { method: 'PATCH', body: JSON.stringify({ leaderLevel: 'building' }) })).status, 403)

  assert.equal((await call(`/api/admin/users/${ctx.ids.teacher}`, staff, { method: 'PATCH', body: JSON.stringify({ leaderLevel: 'nonsense' }) })).status, 400)
  const set = await call(`/api/admin/users/${ctx.ids.teacher}`, staff, { method: 'PATCH', body: JSON.stringify({ leaderLevel: 'teacher_leader' }) })
  assert.equal(set.status, 200)
  assert.match(set.text, /"leaderLevel":"teacher_leader"/)
  const opened = JSON.parse((await call('/api/leaders/scenarios', teacher)).text) as { level: { value: string } }
  assert.equal(opened.level.value, 'teacher_leader')

  await call(`/api/admin/users/${ctx.ids.teacher}`, staff, { method: 'PATCH', body: JSON.stringify({ leaderLevel: null }) })
  assert.equal((await call('/api/leaders/scenarios', teacher)).status, 403, 'removed takes effect at once')
})

test('no admin GET route returns a leader’s practice, and it never counts as activity', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const { adminRouter } = await import('./admin.ts')
  const paths = (adminRouter.stack as { route?: { path: string; methods: Record<string, boolean> } }[])
    .filter((l) => l.route?.methods.get)
    .map((l) => l.route!.path.replace(/:(\w+)/g, ctx!.ids.assistant))
  const statuses: Record<string, number> = {}
  for (const path of paths) {
    const asAdmin = await call(`/api/admin${path}`, { id: ctx.ids.admin, role: 'org_admin' })
    statuses[path] = asAdmin.status
    assert.ok(!asAdmin.text.includes(MARKER), `GET ${path} (org admin) leaked a leader's practice`)
    const sep = path.includes('?') ? '&' : '?'
    const asStaff = await call(`/api/admin${path}${sep}organizationId=${ctx.ids.org}`, { id: ctx.ids.superadmin, role: 'superadmin' })
    assert.ok(!asStaff.text.includes(MARKER), `GET ${path} (superadmin) leaked a leader's practice`)
  }
  for (const path of ['/overview', '/members']) assert.equal(statuses[path], 200, `GET ${path} answered ${statuses[path]}`)

  const members = JSON.parse((await call('/api/admin/members', { id: ctx.ids.admin, role: 'org_admin' })).text) as { id: string; lastActiveAt: string | null; leaderLevel?: unknown }[]
  const ap = members.find((m) => m.id === ctx!.ids.assistant)!
  assert.equal(ap.lastActiveAt, null, 'Leader’s Corner use is not "last active"')
  assert.ok(!('leaderLevel' in ap), 'a school admin’s roster does not show who is a leader')
})
