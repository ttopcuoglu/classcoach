// Self Evaluation sharing: a supervisor sees a teacher's Self Evaluation only when the
// teacher shared it with them AND a superadmin assigned them as that
// teacher's supervisor — and never anything else from the lesson. Run against
// a throwaway in-memory Postgres (PGlite), the same harness as
// leaders.privacy.test.ts. Nothing here calls Anthropic.

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
const TRANSCRIPT_MARKER = 'TRANSCRIPT-MARKER-NEVER-SHARED'

const LENS = {
  framework: 'danielson_2022',
  frameworkName: 'Danielson Framework for Teaching (2022)',
  generatedAt: '2026-11-16T00:00:00.000Z',
  scored: true,
  components: [
    { code: '3b', name: 'Using Questioning and Discussion Techniques', domain: 'Domain 3: Learning Experiences', audibility: 'strong', level: 2, summary: 'Mostly recall.', nextStep: 'Ask why.', evidence: [], teacherNote: 'My pairs talked off mic.' },
  ],
  notObservable: [],
}

type Ids = { org: string; otherOrg: string; superadmin: string; teacher: string; supervisor: string; principal: string; outsider: string; session: string; unshared: string }
let ctx: { base: string; stop: () => Promise<void>; ids: Ids } | null = null
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
  const port = 56000 + Math.floor(Math.random() * 1000)
  const socket = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await socket.start()
  try {
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
    assert.match(process.env.DATABASE_URL, /@127\.0\.0\.1:/, 'this test only ever runs against a local throwaway database')

    const express = (await import('express')).default
    const { prisma } = await import('../lib/prisma.ts')
    const { adminRouter } = await import('./admin.ts')
    const { audioSessionsRouter } = await import('./audioSessions.ts')
    const { selfEvalSharesRouter } = await import('./selfEvalShares.ts')

    const org = await prisma.organization.create({ data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE3' } })
    const otherOrg = await prisma.organization.create({ data: { name: 'Elm Street School', joinCode: 'ELM333' } })
    const superadmin = await prisma.user.create({ data: { email: 'staff@test.example', role: 'superadmin' } })
    const supervisor = await prisma.user.create({ data: { email: 'ap@test.example', name: 'Assistant Principal', organizationId: org.id } })
    const principal = await prisma.user.create({ data: { email: 'principal@test.example', role: 'org_admin', organizationId: org.id } })
    const teacher = await prisma.user.create({ data: { email: 'teacher@test.example', name: 'Ms. Rivera', organizationId: org.id } })
    const outsider = await prisma.user.create({ data: { email: 'other@test.example', organizationId: otherOrg.id } })
    const session = await prisma.audioSession.create({
      data: { userId: teacher.id, status: 'analyzed', classSubject: 'Science', rubricLens: LENS, segments: { create: [{ rawSpeakerTag: 'A', speakerLabel: 'Teacher', startSec: 0, endSec: 5, text: TRANSCRIPT_MARKER }] } },
    })
    const unshared = await prisma.audioSession.create({ data: { userId: teacher.id, status: 'analyzed', rubricLens: LENS } })

    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      const userId = req.header('x-test-user')
      if (userId) req.user = { userId, role: req.header('x-test-role') ?? 'teacher' }
      next()
    })
    app.use('/api/admin', adminRouter)
    app.use('/api/audio-sessions', audioSessionsRouter)
    app.use('/api/self-eval-shares', selfEvalSharesRouter)
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
      ids: {
        org: org.id, otherOrg: otherOrg.id, superadmin: superadmin.id, teacher: teacher.id, supervisor: supervisor.id,
        principal: principal.id, outsider: outsider.id, session: session.id, unshared: unshared.id,
      },
    }
  } catch (error) {
    await socket.stop().catch(() => {})
    await db.close().catch(() => {})
    throw error
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

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', body: JSON.stringify(body) })

test('the whole share lifecycle, and who can read what', async (t) => {
  if (!ctx) return t.skip(skipReason ?? 'no database')
  const { ids } = ctx
  const teacher = { id: ids.teacher, role: 'teacher' }
  const supervisor = { id: ids.supervisor, role: 'teacher' }
  const principal = { id: ids.principal, role: 'org_admin' }
  const superadmin = { id: ids.superadmin, role: 'superadmin' }
  const share = `/api/audio-sessions/${ids.session}/self-eval/share`

  // No supervisor yet: nothing to share with.
  assert.equal((await call(share, teacher, json({ share: true }))).status, 400)

  // The school admin assigns from their own roster, only within their school.
  // The platform-wide users route stays superadmin-only.
  assert.equal((await call(`/api/admin/users/${ids.teacher}`, principal, patch({ supervisorId: ids.supervisor }))).status, 403)
  assert.equal((await call(`/api/admin/members/${ids.teacher}`, principal, patch({ supervisorId: ids.outsider }))).status, 400)
  assert.equal((await call(`/api/admin/members/${ids.teacher}`, principal, patch({ supervisorId: ids.teacher }))).status, 400)
  assert.equal((await call(`/api/admin/members/${ids.outsider}`, principal, patch({ supervisorId: ids.supervisor }))).status, 404)
  assert.equal((await call(`/api/admin/members/${ids.teacher}`, principal, patch({ supervisorId: ids.supervisor }))).status, 200)
  const roster = JSON.parse((await call('/api/admin/members', principal)).text) as { id: string; supervisorId: string | null }[]
  assert.equal(roster.find((m) => m.id === ids.teacher)?.supervisorId, ids.supervisor)
  assert.equal((await call(`/api/admin/members/${ids.teacher}`, principal, patch({ supervisorId: null }))).status, 200)
  // A superadmin can assign too, and only someone from the same school.
  assert.equal((await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ supervisorId: ids.outsider }))).status, 400)
  assert.equal((await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ supervisorId: ids.teacher }))).status, 400)
  assert.equal((await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ supervisorId: ids.supervisor }))).status, 200)

  // Assigned but not shared: the supervisor sees nothing.
  assert.equal(JSON.parse((await call('/api/self-eval-shares', supervisor)).text).length, 0)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, supervisor)).status, 404)

  // Shared: the supervisor sees this Self Evaluation with the teacher's note, and
  // nothing from the transcript. The other lesson stays private.
  const shared = JSON.parse((await call(share, teacher, json({ share: true }))).text)
  assert.equal(shared.supervisorName, 'Assistant Principal')
  assert.ok(shared.sharedAt)
  const list = JSON.parse((await call('/api/self-eval-shares', supervisor)).text) as { sessionId: string }[]
  assert.deepEqual(list.map((s) => s.sessionId), [ids.session])
  assert.equal((list[0] as unknown as { isNew: boolean }).isNew, true, 'new until the supervisor opens it')
  const detail = await call(`/api/self-eval-shares/${ids.session}`, supervisor)
  assert.equal(detail.status, 200)
  assert.ok(detail.text.includes('My pairs talked off mic.'))
  assert.ok(!detail.text.includes(TRANSCRIPT_MARKER), 'the transcript never leaves the teacher')
  assert.equal((await call(`/api/self-eval-shares/${ids.unshared}`, supervisor)).status, 404)

  // Inbox status, feedback, my teachers and reports — all only from shares.
  const put = (body: unknown): RequestInit => ({ method: 'PUT', body: JSON.stringify(body) })
  const inbox = JSON.parse((await call('/api/self-eval-shares', supervisor)).text) as { status: string; lessonTitle: string }[]
  assert.equal(inbox[0].status, 'awaiting')
  assert.ok(!JSON.stringify(inbox).includes(TRANSCRIPT_MARKER))

  // Opened above, so no longer new; the Reviewed checkmark is the supervisor's alone.
  const afterOpen = JSON.parse((await call('/api/self-eval-shares', supervisor)).text) as { isNew: boolean; reviewed: boolean }[]
  assert.equal(afterOpen[0].isNew, false, 'opened: no longer new')
  assert.equal((await call(`/api/self-eval-shares/${ids.session}/reviewed`, principal, put({ reviewed: true }))).status, 404, 'only the supervisor it is shared with')
  assert.equal((await call(`/api/self-eval-shares/${ids.session}/reviewed`, supervisor, put({ reviewed: true }))).status, 200)
  assert.equal((JSON.parse((await call('/api/self-eval-shares', supervisor)).text) as { reviewed: boolean }[])[0].reviewed, true)
  assert.equal((await call(`/api/self-eval-shares/${ids.unshared}/feedback`, supervisor, put({ feedback: 'x' }))).status, 404)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}/feedback`, principal, put({ feedback: 'x' }))).status, 404)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}/feedback`, supervisor, put({ feedback: 'Strong pairs work.' }))).status, 200)
  assert.equal(JSON.parse((await call('/api/self-eval-shares', supervisor)).text)[0].status, 'replied')
  const mine = JSON.parse((await call(share, teacher)).text)
  assert.equal(mine.feedback.text, 'Strong pairs work.')
  assert.equal(mine.feedback.fromName, 'Assistant Principal')
  const myTeachers = JSON.parse((await call('/api/self-eval-shares/teachers', supervisor)).text) as { teacherId: string; shares: unknown[] }[]
  assert.deepEqual(myTeachers.map((t) => t.teacherId), [ids.teacher])
  assert.equal(myTeachers[0].shares.length, 1)
  assert.equal(JSON.parse((await call('/api/self-eval-shares/teachers', principal)).text).length, 0)
  const report = JSON.parse((await call(`/api/self-eval-shares/report?teacherId=${ids.teacher}`, supervisor)).text)
  assert.equal(report.activity.shared, 1)
  assert.equal(report.components[0].levels['2'], 1, 'the shared lesson only; the unshared one is not counted')
  assert.equal(report.components[0].notes, 1)
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const outOfRange = JSON.parse((await call(`/api/self-eval-shares/report?teacherId=${ids.teacher}&from=${future}`, supervisor)).text)
  assert.equal(outOfRange.activity.shared, 0, 'a date range leaves out lessons taught outside it')
  const inRange = JSON.parse((await call(`/api/self-eval-shares/report?teacherId=${ids.teacher}&to=${future}&from=nonsense`, supervisor)).text)
  assert.equal(inRange.activity.shared, 1, 'an unparseable end is ignored')
  const workspace = JSON.parse((await call('/api/self-eval-shares/workspace', supervisor)).text)
  assert.deepEqual(workspace.teachers.map((t: { teacherId: string }) => t.teacherId), [ids.teacher])
  assert.deepEqual(workspace.shares.map((s: { sessionId: string }) => s.sessionId), [ids.session], 'the workspace holds the shared lesson only')
  assert.equal(workspace.shares[0].feedback, 'Strong pairs work.')
  assert.ok(workspace.shares[0].components.length > 0)
  assert.ok(!JSON.stringify(workspace).includes(TRANSCRIPT_MARKER), 'never the transcript')
  const principalWorkspace = JSON.parse((await call('/api/self-eval-shares/workspace', principal)).text)
  assert.equal(principalWorkspace.shares.length, 0)
  assert.equal(principalWorkspace.teachers.length, 0)
  const principalReport = JSON.parse((await call(`/api/self-eval-shares/report?teacherId=${ids.teacher}`, principal)).text)
  assert.equal(principalReport.activity.shared, 0)
  assert.equal(principalReport.components.length, 0)

  // Nobody else: not the school admin, not someone at another school, and the
  // supervisor still cannot open the lesson itself.
  assert.equal(JSON.parse((await call('/api/self-eval-shares', principal)).text).length, 0)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, principal)).status, 404)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, { id: ids.outsider, role: 'teacher' })).status, 404)
  assert.equal((await call(`/api/audio-sessions/${ids.session}`, supervisor)).status, 404)

  // The supervisor reads the report as it was sent: a note changed afterwards
  // reaches them only when the teacher shares again.
  const note = `/api/audio-sessions/${ids.session}/rubric-lens/note`
  assert.equal((await call(note, teacher, put({ code: '3b', note: 'Changed after sharing.' }))).status, 200)
  const frozen = (await call(`/api/self-eval-shares/${ids.session}`, supervisor)).text
  assert.ok(frozen.includes('My pairs talked off mic.') && !frozen.includes('Changed after sharing.'), 'a later edit is not sent on its own')
  await call(share, teacher, json({ share: true, previewed: true }))
  const resent = JSON.parse((await call(`/api/self-eval-shares/${ids.session}`, supervisor)).text)
  assert.equal(resent.report.components[0].teacherNote, 'Changed after sharing.')
  assert.equal(resent.status, 'awaiting', 'sharing again asks for feedback again')
  assert.ok(!JSON.stringify(resent).includes(TRANSCRIPT_MARKER))

  // Stop sharing: gone at once, and the sent copy with it.
  await call(share, teacher, json({ share: false }))
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, supervisor)).status, 404)

  // Reassigning the supervisor ends the old one's access to earlier shares.
  await call(share, teacher, json({ share: true }))
  assert.equal((await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ supervisorId: ids.principal }))).status, 200)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, supervisor)).status, 404)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, principal)).status, 404, 'a share goes to a person, not to whoever supervises next')
  assert.equal(JSON.parse((await call(share, teacher)).text).sharedAt, null)

  // Changing school ends the supervision link.
  await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ supervisorId: ids.supervisor }))
  await call(share, teacher, json({ share: true }))
  await call(`/api/admin/users/${ids.teacher}`, superadmin, patch({ organizationId: ids.otherOrg }))
  assert.equal(JSON.parse((await call(share, teacher)).text).supervisorName, null)
  assert.equal((await call(`/api/self-eval-shares/${ids.session}`, supervisor)).status, 404)
})
