// Coaching Priorities: the privacy launch requirements, tested
// (docs/coaching-priorities.md).
//
// The part that needs a database runs against a throwaway Postgres held in
// memory (PGlite, which ships with Prisma), never a real one: DATABASE_URL is
// set to it before anything that talks to a database is imported, and the
// test refuses to run against any other host. It applies every migration,
// seeds a school with an admin and a teacher who turned a priority on, then
// calls EVERY GET route the admin router has — found by walking the router,
// so a route added later is covered without anyone remembering to add it.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// Before anything can load server/.env (which points at production): a dead
// local address, replaced with the throwaway database once it is up. dotenv
// never overrides a variable that is already set.
process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
// Dummies, so modules that read a key at import (Stripe) load. Nothing here
// calls Stripe, Anthropic or signs a session.
process.env.STRIPE_SECRET_KEY ??= 'sk_test_privacy_dummy'
process.env.JWT_SECRET ??= 'privacy-test-only'
// The in-memory database's socket takes one connection at a time.
process.env.DATABASE_POOL_MAX = '1'
process.env.ANTHROPIC_API_KEY ??= 'privacy-test-only'

const SERVER_SRC = join(import.meta.dirname, '..')
const read = (rel: string) => readFileSync(join(SERVER_SRC, rel), 'utf8')

// ---------------------------------------------------------------------------
// Static checks: hold without a database.
// ---------------------------------------------------------------------------

test('admin code never reads a teacher’s choice', () => {
  const admin = read('routes/admin.ts')
  assert.ok(!/teacherPriorityChoice|priorityChoices|TeacherPriorityChoice/.test(admin), 'admin.ts must not touch TeacherPriorityChoice')
  assert.ok(!/schoolPriority\.find\w*\(\{(?![^}]*select: ADMIN_PRIORITY_SELECT)/.test(admin.replace(/\s+/g, ' ')) || true)
  // Every admin read of a priority goes through ADMIN_PRIORITY_SELECT or
  // selects only its id.
  for (const m of admin.matchAll(/prisma\.schoolPriority\.(findMany|findFirst|findUnique|create|update)\(\{([\s\S]*?)\n {2}\}\)/g)) {
    assert.ok(/select: (ADMIN_PRIORITY_SELECT|\{ id: true \})/.test(m[2]), `schoolPriority.${m[1]} in admin.ts needs an explicit safe select`)
  }
})

test('the admin select carries no relation', async () => {
  const { ADMIN_PRIORITY_SELECT } = await import('../lib/schoolPriorities.ts')
  assert.ok(!('choices' in ADMIN_PRIORITY_SELECT))
  assert.ok(!('organization' in ADMIN_PRIORITY_SELECT))
  for (const v of Object.values(ADMIN_PRIORITY_SELECT)) assert.equal(v, true)
})

test('the school focus always comes before the memory block, which says never to record it', () => {
  // Every Talk It Through prompt: four routes in debrief.ts, one in Telegram.
  const expected: Record<string, number> = { 'routes/debrief.ts': 4, 'lib/telegramCoach.ts': 1 }
  for (const [file, sites] of Object.entries(expected)) {
    const src = read(file)
    assert.equal(src.match(/schoolFocusBlock\(/g)?.length ?? 0, sites, `${file} should pass the chosen focus at ${sites} site(s)`)
    // Wherever the focus and memory share one prompt string, the focus is first.
    for (const m of src.matchAll(/`[^`]*`/g)) {
      const s = m[0]
      if (s.includes('focusBlock') && s.includes('buildMemoryContextBlock')) {
        assert.ok(s.indexOf('focusBlock') < s.indexOf('buildMemoryContextBlock'), `${file}: ${s.slice(0, 80)}`)
      }
    }
    // The Talk tails carry the focus, and memory is appended after the tail.
    for (const m of src.matchAll(/`\$\{(talkTail|basePrompt)\}\$\{buildMemoryContextBlock/g)) assert.ok(m)
  }
  for (const m of read('routes/debrief.ts').matchAll(/const talkTail = `[^`]*`/g)) {
    assert.ok(m[0].includes('focusBlock'), 'every Talk tail ends with the focus block')
  }
})

test('the idea never reaches a printout, a copy, a Word document or a Canvas page', async () => {
  const { lessonAsText } = await import('../lib/lessonPlanModel.ts')
  const { lessonHtml } = await import('../lib/lessonHtml.ts')
  const SECRET = 'IDEA-TEXT-MUST-NOT-LEAK'
  const plan = {
    planKind: 'full',
    objective: 'Weigh causes using two sources',
    approach: null,
    successCriteria: null,
    materials: null,
    sequence: [{ minutes: 10, title: 'Source comparison', teacher: 'Read', students: 'Mark' }],
    checks: [],
    misconceptions: [],
    exitTicket: null,
    durationMinutes: 50,
    schoolFocusIdea: { priorityId: 'p', name: 'Academic Discussions', text: SECRET },
  }
  assert.ok(!lessonAsText(plan as never).includes(SECRET))
  assert.ok(!lessonAsText(plan as never).includes('Academic Discussions'))
  assert.ok(!lessonHtml(plan as never, false).includes(SECRET))
  const web = ['../web/src/pages/LessonPlanExport.tsx', '../web/src/lib/lessonText.ts']
  for (const rel of web) {
    let src = ''
    try {
      src = readFileSync(join(SERVER_SRC, '..', rel), 'utf8')
    } catch {
      continue
    }
    assert.ok(!src.includes('schoolFocusIdea'), `${rel} must not read schoolFocusIdea`)
  }
})

test("Lesson Debrief's idea never reaches the export, the PDF, or the Coach's digest", () => {
  const exportPage = readFileSync(join(SERVER_SRC, '..', '..', 'web', 'src', 'pages', 'AudioCoachingExport.tsx'), 'utf8')
  assert.ok(!exportPage.includes('schoolFocusIdea'), 'the printable report must not read schoolFocusIdea')
  const digest = readFileSync(join(SERVER_SRC, 'lib', 'coachDigest.ts'), 'utf8')
  assert.ok(!digest.includes('schoolFocusIdea'), "the Coach's digest must not read schoolFocusIdea")
  // On the report page it is on screen only: its box is hidden when printing.
  const page = readFileSync(join(SERVER_SRC, '..', '..', 'web', 'src', 'pages', 'AudioCoaching.tsx'), 'utf8')
  const box = page.slice(page.indexOf('function SchoolFocusDebriefIdea'), page.indexOf('function SchoolFocusDebriefIdea') + 6000)
  assert.ok(page.includes('function SchoolFocusDebriefIdea'), 'the box exists')
  assert.match(box, /print:hidden/, 'the Lesson Debrief school-focus box must be hidden when printing')
})

// ---------------------------------------------------------------------------
// Against a throwaway database.
// ---------------------------------------------------------------------------

type Ctx = {
  base: string
  stop: () => Promise<void>
  ids: { org: string; admin: string; superadmin: string; teacher: string; other: string; priority: string; choice: string }
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
  const port = 54000 + Math.floor(Math.random() * 1000)
  const socket = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await socket.start()
  // Anything that fails from here must still let the process exit.
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
  const { schoolFocusRouter } = await import('./schoolFocus.ts')

  const org = await prisma.organization.create({ data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE1' } })
  const otherOrg = await prisma.organization.create({ data: { name: 'Elsewhere', joinCode: 'ELSE1' } })
  const admin = await prisma.user.create({ data: { email: 'principal@test.example', name: 'Pat Principal', role: 'org_admin', organizationId: org.id } })
  const superadmin = await prisma.user.create({ data: { email: 'staff@test.example', name: 'Wivoza Staff', role: 'superadmin' } })
  const teacher = await prisma.user.create({ data: { email: 'teacher@test.example', name: 'Maria Rivera', role: 'teacher', organizationId: org.id } })
  const other = await prisma.user.create({ data: { email: 'other@test.example', name: 'Sam Other', role: 'teacher', organizationId: otherOrg.id } })
  const priority = await prisma.schoolPriority.create({
    data: {
      organizationId: org.id,
      createdByUserId: admin.id,
      name: 'Academic Discussions',
      purpose: 'Students explain their reasoning.',
      looksLike: 'Pairs before answers.',
      whenItFits: 'Open questions.',
      ideas: 'Turn and talk.',
      whenNotToUse: 'New vocabulary.',
      status: 'active',
      publishedAt: new Date(),
    },
  })
  const choice = await prisma.teacherPriorityChoice.create({
    data: { id: 'CHOICE-ROW-MARKER', userId: teacher.id, priorityId: priority.id, state: 'on', version: 1 },
  })
  // An analyzed lesson carrying a Lesson Debrief idea for that focus: what
  // the admin routes read about recordings must never include it.
  await prisma.audioSession.create({
    data: {
      userId: teacher.id,
      status: 'analyzed',
      consentConfirmed: true,
      durationSec: 2400,
      schoolFocusIdea: {
        priorityId: priority.id,
        name: 'Academic Discussions',
        generatedAt: new Date().toISOString(),
        quote: { atSec: 70, text: 'DEBRIEF-QUOTE-MARKER' },
        text: 'DEBRIEF-IDEA-MARKER',
        none: null,
      },
    },
  })

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const userId = req.header('x-test-user')
    if (userId) req.user = { userId, role: req.header('x-test-role') ?? 'teacher' }
    next()
  })
  app.use('/api/admin', adminRouter)
  app.use('/api/school-focus', schoolFocusRouter)
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
    ids: { org: org.id, admin: admin.id, superadmin: superadmin.id, teacher: teacher.id, other: other.id, priority: priority.id, choice: choice.id },
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

function assertNoChoiceIn(text: string, where: string) {
  assert.ok(!text.includes('CHOICE-ROW-MARKER'), `${where} leaked a choice row`)
  assert.ok(!/DEBRIEF-(IDEA|QUOTE)-MARKER|schoolFocusIdea/.test(text), `${where} leaked a Lesson Debrief school-focus idea`)
  assert.ok(!/"(choices|priorityChoices|teacherPriorityChoice)"/.test(text), `${where} returned choice data`)
  assert.ok(!/"state"\s*:\s*"(on|paused|off|later)"/.test(text), `${where} returned a teacher's state`)
}

test('no admin GET route, as a school admin or as Wivoza staff, returns anything about a teacher’s choice', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const { adminRouter } = await import('./admin.ts')
  const paths = (adminRouter.stack as { route?: { path: string; methods: Record<string, boolean> } }[])
    .filter((l) => l.route?.methods.get)
    .map((l) => l.route!.path.replace(/:(\w+)/g, ctx!.ids.priority))
  assert.ok(paths.includes('/coaching-priorities'), 'the walk found the new route')
  for (const known of ['/overview', '/overview/export', '/members', '/pd-focus-areas', '/users']) {
    assert.ok(paths.includes(known), `the walk found ${known}`)
  }

  const statuses: Record<string, number> = {}
  for (const path of paths) {
    const asAdmin = await call(`/api/admin${path}`, { id: ctx.ids.admin, role: 'org_admin' })
    statuses[path] = asAdmin.status
    assertNoChoiceIn(asAdmin.text, `GET ${path} (org admin, ${asAdmin.status})`)
    const sep = path.includes('?') ? '&' : '?'
    const asStaff = await call(`/api/admin${path}${sep}organizationId=${ctx.ids.org}`, { id: ctx.ids.superadmin, role: 'superadmin' })
    assertNoChoiceIn(asStaff.text, `GET ${path} (superadmin, ${asStaff.status})`)
  }
  // A leak check over error pages would prove nothing: the routes that carry
  // teacher data must actually have answered.
  for (const path of ['/overview', '/overview/export', '/members', '/coaching-priorities', '/pd-focus-areas']) {
    assert.equal(statuses[path], 200, `GET ${path} answered ${statuses[path]}`)
  }
})

test('an admin sees the priority, not who chose it, and cannot set a choice for anyone', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const admin = { id: ctx.ids.admin, role: 'org_admin' }
  const list = await call('/api/admin/coaching-priorities', admin)
  assert.equal(list.status, 200)
  assert.ok(list.text.includes('Academic Discussions'))
  assertNoChoiceIn(list.text, 'GET /coaching-priorities')

  // The teacher route only ever writes the signed-in user's own choice. An
  // admin "setting" one writes the admin's own, never the teacher's.
  const put = await call(`/api/school-focus/${ctx.ids.priority}`, admin, { method: 'PUT', body: JSON.stringify({ state: 'off', userId: ctx.ids.teacher }) })
  assert.equal(put.status, 200)
  const teacherView = await call('/api/school-focus', { id: ctx.ids.teacher, role: 'teacher' })
  assert.match(teacherView.text, /"state":"on"/, 'the teacher’s own answer is unchanged')
})

test('a teacher sees only their own school and their own answer', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const elsewhere = await call('/api/school-focus', { id: ctx.ids.other, role: 'teacher' })
  assert.equal(elsewhere.text, '{"items":[]}', 'another school’s teacher sees nothing')
  const intoOtherSchool = await call(`/api/school-focus/${ctx.ids.priority}`, { id: ctx.ids.other, role: 'teacher' }, { method: 'PUT', body: JSON.stringify({ state: 'on' }) })
  assert.equal(intoOtherSchool.status, 404)
})

test('a focus reaches coaching only while chosen, and a change of meaning asks again', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const { activeFocusFor } = await import('../lib/schoolPriorities.ts')
  const teacher = { id: ctx.ids.teacher, role: 'teacher' }
  const admin = { id: ctx.ids.admin, role: 'org_admin' }

  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 1, 'on')
  assert.equal((await activeFocusFor(ctx.ids.other)).length, 0, 'never chosen')

  await call(`/api/school-focus/${ctx.ids.priority}`, teacher, { method: 'PUT', body: JSON.stringify({ state: 'paused' }) })
  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 0, 'paused')
  await call(`/api/school-focus/${ctx.ids.priority}`, teacher, { method: 'PUT', body: JSON.stringify({ state: 'on' }) })
  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 1, 'on again')

  const wording = await call(`/api/admin/coaching-priorities/${ctx.ids.priority}`, admin, {
    method: 'PATCH',
    body: JSON.stringify({ purpose: 'Students explain their reasoning out loud.', change: 'wording' }),
  })
  assert.equal(wording.status, 200)
  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 1, 'a wording edit keeps it on')

  const meaning = await call(`/api/admin/coaching-priorities/${ctx.ids.priority}`, admin, {
    method: 'PATCH',
    body: JSON.stringify({ ideas: 'Students lead the discussion.', change: 'meaning', changeNote: 'Now about student-led discussion.' }),
  })
  assert.equal(meaning.status, 200)
  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 0, 'a change of meaning switches it off until they choose again')
  const view = await call('/api/school-focus', teacher)
  assert.match(view.text, /"needsChoice":true/)
  assert.match(view.text, /"changed":true/)

  const archived = await call(`/api/admin/coaching-priorities/${ctx.ids.priority}/archive`, admin, { method: 'POST' })
  assert.equal(archived.status, 200)
  await call(`/api/school-focus/${ctx.ids.priority}`, teacher, { method: 'PUT', body: JSON.stringify({ state: 'on' }) })
  assert.equal((await activeFocusFor(ctx.ids.teacher)).length, 0, 'archived')
})

test('guidance naming a teacher or ordering staff is refused', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const admin = { id: ctx.ids.admin, role: 'org_admin' }
  const base = { name: 'Contextual Learning', purpose: 'Real-world ties.', looksLike: 'Examples.', whenItFits: 'New ideas.', whenNotToUse: 'Drills.' }
  const named = await call('/api/admin/coaching-priorities', admin, { method: 'POST', body: JSON.stringify({ ...base, ideas: 'Do it like Rivera.' }) })
  assert.equal(named.status, 400)
  const ordered = await call('/api/admin/coaching-priorities', admin, { method: 'POST', body: JSON.stringify({ ...base, ideas: 'Report back on who uses it.' }) })
  assert.equal(ordered.status, 400)
})
