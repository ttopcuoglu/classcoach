// Observations: only a supervisor can observe; the Teacher box only offers
// people at the supervisor's own school; nobody but the observer sees a draft;
// the teacher reads it only once sent, and never the transcript. Same
// throwaway in-memory Postgres (PGlite) harness as selfEvalShares.privacy.test.ts.
// Nothing here calls Anthropic: the draft is written straight to the row.

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
const TRANSCRIPT_MARKER = 'OBSERVATION-TRANSCRIPT-NEVER-SENT'

type Ids = { supervisor: string; teacher: string; colleague: string; outsider: string }
let ctx: { base: string; stop: () => Promise<void>; ids: Ids; prisma: typeof import('../lib/prisma.ts')['prisma'] } | null = null

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket')
  const db = await PGlite.create()
  const dir = join(SERVER_SRC, '..', 'prisma', 'migrations')
  for (const name of readdirSync(dir).filter((n) => /^\d{14}_/.test(n)).sort()) {
    await db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8'))
  }
  const port = 57000 + Math.floor(Math.random() * 1000)
  const socket = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await socket.start()
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  assert.match(process.env.DATABASE_URL, /@127\.0\.0\.1:/, 'this test only ever runs against a local throwaway database')

  const express = (await import('express')).default
  const { prisma } = await import('../lib/prisma.ts')
  const { observationsRouter } = await import('./observations.ts')

  const org = await prisma.organization.create({ data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE4' } })
  const otherOrg = await prisma.organization.create({ data: { name: 'Elm Street School', joinCode: 'ELM444' } })
  const supervisor = await prisma.user.create({ data: { email: 'ap@test.example', name: 'Assistant Principal', organizationId: org.id } })
  const teacher = await prisma.user.create({ data: { email: 'rivera@test.example', name: 'Ms. Rivera', organizationId: org.id, supervisorId: supervisor.id, subjects: 'Science', gradeLevels: '8th' } })
  const colleague = await prisma.user.create({ data: { email: 'chen@test.example', name: 'Mr. Chen', organizationId: org.id } })
  const outsider = await prisma.user.create({ data: { email: 'rivers@elm.example', name: 'Ms. Rivers', organizationId: otherOrg.id } })

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    const userId = req.header('x-test-user')
    if (userId) req.user = { userId, role: 'teacher' }
    next()
  })
  app.use('/api/observations', observationsRouter)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port: httpPort } = server.address() as AddressInfo
  ctx = {
    base: `http://127.0.0.1:${httpPort}`,
    prisma,
    ids: { supervisor: supervisor.id, teacher: teacher.id, colleague: colleague.id, outsider: outsider.id },
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await prisma.$disconnect()
      await socket.stop()
      await db.close()
    },
  }
})

after(async () => {
  await ctx?.stop()
})

async function call(path: string, as: string, init: RequestInit = {}) {
  const res = await fetch(`${ctx!.base}${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-test-user': as, ...(init.headers ?? {}) } })
  return { status: res.status, body: JSON.parse((await res.text()) || 'null') }
}
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

test('who can observe, who they can pick, and who reads what', async () => {
  const { supervisor, teacher, colleague, outsider } = ctx!.ids

  // Only a supervisor.
  assert.equal((await call('/api/observations', teacher)).status, 403)
  assert.equal((await call('/api/observations/teachers?q=Ri', teacher)).status, 403)

  // The Teacher box: my school only, by name or email; my own teachers first.
  const found = (await call('/api/observations/teachers?q=ri', supervisor)).body as { id: string }[]
  assert.deepEqual(found.map((t) => t.id), [teacher], 'Ms. Rivers at another school is never offered')
  const byEmail = (await call('/api/observations/teachers?q=chen@', supervisor)).body as { id: string }[]
  assert.deepEqual(byEmail.map((t) => t.id), [colleague])
  const all = (await call('/api/observations/teachers', supervisor)).body as { id: string; mine: boolean }[]
  assert.equal(all[0].id, teacher)
  assert.ok(!all.some((t) => t.id === supervisor), 'never myself')

  // A teacher at another school can't be linked; a typed name can be used.
  assert.equal((await call('/api/observations', supervisor, post({ teacherId: outsider }))).status, 400)
  const typed = (await call('/api/observations', supervisor, post({ teacherName: 'Substitute in Room 12', lessonTitle: 'Fractions' }))).body
  assert.equal(typed.teacherId, null)

  const created = await call('/api/observations', supervisor, post({ teacherId: teacher, lessonTitle: 'Conductivity' }))
  assert.equal(created.status, 201)
  const id = created.body.id as string
  assert.equal(created.body.teacherName, 'Ms. Rivera')
  assert.equal(created.body.subject, 'Science', 'subject and grade come from the teacher’s profile')

  // Stand in for the recording and the written draft.
  await ctx!.prisma.observation.update({
    where: { id },
    data: {
      status: 'draft',
      answeredAt: new Date(),
      transcript: [{ speaker: 0, startSec: 0, endSec: 5, text: TRANSCRIPT_MARKER }],
      report: { version: 1, generatedAt: 'x', frameworkName: 'Danielson', about: 'A lesson.', planVsLesson: null, planning: null, comments: null, recordingMissing: false, components: [{ code: '3b', name: 'Questioning', domain: 'Domain 3', suggestedLevel: 3, level: 3, reason: 'r', observed: null, notes: [], recording: [], disagreement: null, nextStep: null }] },
    },
  })

  // The observer reads their draft, never with the transcript.
  const draft = await call(`/api/observations/${id}`, supervisor)
  assert.equal(draft.status, 200)
  assert.ok(!JSON.stringify(draft.body).includes(TRANSCRIPT_MARKER))
  assert.equal(draft.body.hasRecording, true)

  // Nobody else reads or changes it, and the teacher doesn't see a draft.
  assert.equal((await call(`/api/observations/${id}`, colleague)).status, 403)
  assert.equal((await call(`/api/observations/received/${id}`, teacher)).status, 404)
  assert.equal(((await call('/api/observations/received', teacher)).body as unknown[]).length, 0)

  // The supervisor's level and comments, then send.
  const set = await call(`/api/observations/${id}/report`, supervisor, { method: 'PUT', body: JSON.stringify({ levels: { '3b': 4 }, comments: 'Strong pairs work.' }) })
  assert.equal(set.body.report.components[0].level, 4)
  assert.equal(set.body.report.components[0].suggestedLevel, 3, 'Wivoza’s suggestion is kept beside the supervisor’s level')
  assert.equal((await call(`/api/observations/${typed.id}/send`, supervisor, post({}))).status, 400, 'a typed name can’t receive it')
  assert.equal((await call(`/api/observations/${id}/send`, supervisor, post({}))).status, 200)

  // Now the teacher reads it, without the transcript, and it can't be deleted or changed.
  const received = await call(`/api/observations/received/${id}`, teacher)
  assert.equal(received.status, 200)
  assert.equal(received.body.observerName, 'Assistant Principal')
  assert.equal(received.body.report.comments, 'Strong pairs work.')
  assert.ok(!JSON.stringify(received.body).includes(TRANSCRIPT_MARKER))
  assert.equal((await call(`/api/observations/received/${id}`, colleague)).status, 404, 'only the teacher it was sent to')
  assert.equal((await call(`/api/observations/${id}`, supervisor, { method: 'DELETE' })).status, 400)
  assert.equal((await call(`/api/observations/${id}/report`, supervisor, { method: 'PUT', body: JSON.stringify({ comments: 'x' }) })).status, 400)
})
