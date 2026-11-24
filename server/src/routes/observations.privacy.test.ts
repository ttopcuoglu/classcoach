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
// Nothing here may reach Claude: a review written in the background fails at
// once against a closed local port.
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9'

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
  const { audioSessionsRouter } = await import('./audioSessions.ts')
  const { planReviewsRouter } = await import('./planReviews.ts')

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
  app.use('/api/audio-sessions', audioSessionsRouter)
  app.use('/api/plan-reviews', planReviewsRouter)
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

  // Record first, say who later: no details needed to start, but the report
  // can't be prepared until the teacher is named.
  const blank = (await call('/api/observations', supervisor, post({}))).body
  assert.equal(blank.teacherName, '')
  assert.equal((await call(`/api/observations/${blank.id}/answers`, supervisor, post({ answers: {}, notes: [], recording: false }))).status, 400)
  const linked = (await call(`/api/observations/${blank.id}`, supervisor, { method: 'PATCH', body: JSON.stringify({ teacherId: teacher }) })).body
  assert.equal(linked.teacherName, 'Ms. Rivera')
  assert.equal(linked.gradeLevel, '8th', 'grade from the teacher’s profile when linked later')

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

  // Its recording is a lesson owned by the supervisor, but never in their own
  // Lesson Debrief list.
  const sessionId = draft.body.sessionId as string
  assert.ok(sessionId)
  const ownList = (await call('/api/audio-sessions', supervisor)).body as { id: string }[]
  assert.ok(!ownList.some((s) => s.id === sessionId), 'an observation recording is not one of the supervisor’s lessons')
  await ctx!.prisma.audioSession.update({
    where: { id: sessionId },
    data: { status: 'analyzed', segments: { create: [{ rawSpeakerTag: 'A', speakerLabel: 'Teacher', startSec: 0, endSec: 5, text: 'Today we are comparing conductors.' }] } },
  })
  assert.equal((await call(`/api/observations/received/${id}/lesson`, teacher)).status, 404, 'not before it is sent')

  // Nobody else reads or changes it, and the teacher doesn't see a draft.
  assert.equal((await call(`/api/observations/${id}`, colleague)).status, 403)
  assert.equal((await call(`/api/observations/received/${id}`, teacher)).status, 404)
  assert.equal(((await call('/api/observations/received', teacher)).body as unknown[]).length, 0)

  // The supervisor's level and comments, then send.
  const set = await call(`/api/observations/${id}/report`, supervisor, { method: 'PUT', body: JSON.stringify({ levels: { '3b': 4 }, comments: 'Strong pairs work.' }) })
  assert.equal(set.body.report.components[0].level, 4)
  assert.equal(set.body.report.components[0].suggestedLevel, 3, 'Wivoza’s suggestion is kept beside the supervisor’s level')

  // Back to the notes and answers from a draft: resubmitting them sends the
  // report to be written again (its recording isn't ready here, so it waits).
  const redo = (await call('/api/observations', supervisor, post({ teacherId: teacher }))).body
  await ctx!.prisma.observation.update({ where: { id: redo.id }, data: { status: 'draft', answeredAt: new Date(), report: { components: [] } } })
  const resubmitted = await call(`/api/observations/${redo.id}/answers`, supervisor, post({ answers: { climate: 'warm' }, notes: [{ atSec: 30, text: 'Changed note', code: '2a' }] }))
  assert.equal(resubmitted.status, 202)
  assert.equal(resubmitted.body.status, 'pending')
  assert.deepEqual(resubmitted.body.answers, { climate: 'warm' })
  assert.equal(resubmitted.body.notes[0].text, 'Changed note')
  assert.equal((await call(`/api/observations/${typed.id}/send`, supervisor, post({}))).status, 400, 'a typed name can’t receive it')
  assert.equal((await call(`/api/observations/${id}/send`, supervisor, post({}))).status, 200)

  // Now the teacher reads it, without the transcript, and it can't be deleted or changed.
  const received = await call(`/api/observations/received/${id}`, teacher)
  assert.equal(received.status, 200)
  assert.equal(received.body.observerName, 'Assistant Principal')
  assert.equal(received.body.report.comments, 'Strong pairs work.')
  assert.ok(!JSON.stringify(received.body).includes(TRANSCRIPT_MARKER))
  assert.equal((await call(`/api/observations/received/${id}`, colleague)).status, 404, 'only the teacher it was sent to')
  assert.equal(received.body.hasLesson, true)
  const lesson = await call(`/api/observations/received/${id}/lesson`, teacher)
  assert.equal(lesson.status, 200)
  assert.equal(lesson.body.status, 'locked', 'read-only on the teacher’s side')
  assert.equal(lesson.body.segments.length, 1)
  assert.equal((await call(`/api/observations/received/${id}/lesson`, colleague)).status, 404)
  assert.equal((await call(`/api/audio-sessions/${sessionId}`, teacher)).status, 404, 'the teacher reads it only through the observation')
  assert.equal((await call(`/api/observations/${id}/report`, supervisor, { method: 'PUT', body: JSON.stringify({ comments: 'x' }) })).status, 400)

  // The supervisor can delete any of their observations, a sent one too:
  // only theirs, and it leaves the teacher's Observations with its lesson.
  assert.equal((await call(`/api/observations/${id}`, colleague, { method: 'DELETE' })).status, 403)
  assert.equal((await call(`/api/observations/${id}`, supervisor, { method: 'DELETE' })).status, 200)
  assert.equal((await call(`/api/observations/received/${id}`, teacher)).status, 404)
  assert.equal(await ctx!.prisma.audioSession.count({ where: { id: sessionId } }), 0, 'its recording goes with it')
})

test('lesson plan reviews: only a supervisor, only their school, and the teacher reads it once sent', async () => {
  const { supervisor, teacher, colleague, outsider } = ctx!.ids
  const plan = 'Objective: Students will explain why salt water conducts electricity and sugar water does not.\n\nLab: pairs test four solutions and record results.\n\nExit ticket: two sentences on why.'
  assert.equal((await call('/api/plan-reviews', teacher, post({ teacherName: 'x', text: plan }))).status, 403, 'only supervisors')
  assert.equal((await call('/api/plan-reviews', supervisor, post({ teacherId: outsider, text: plan }))).status, 400, 'never another school')
  assert.equal((await call('/api/plan-reviews', supervisor, post({ teacherId: teacher, text: 'too short' }))).status, 400)
  const created = await call('/api/plan-reviews', supervisor, post({ teacherId: teacher, lessonTitle: 'Conductivity', text: plan }))
  assert.equal(created.status, 201)
  const id = created.body.id as string
  assert.equal(created.body.teacherName, 'Ms. Rivera')
  assert.equal(created.body.plan.length, 3)
  // The background write fails without Claude; let it finish before going on.
  for (let i = 0; i < 100; i++) {
    const row = await ctx!.prisma.lessonPlanReview.findUnique({ where: { id }, select: { status: true } })
    if (row?.status !== 'generating') break
    await new Promise((r) => setTimeout(r, 200))
  }

  // Stand in for the written draft (the real one needs Claude).
  await ctx!.prisma.lessonPlanReview.update({
    where: { id },
    data: { status: 'draft', report: { version: 1, generatedAt: 'x', about: 'A lab.', planning: [{ code: '1c', name: 'Outcomes', domain: 'Domain 1', level: 3, explanation: 'e', excerpts: [] }], format: null, strengths: ['Clear goal.'], nextSteps: [], comments: null } },
  })
  assert.equal((await call(`/api/plan-reviews/${id}`, colleague)).status, 403)
  assert.equal((await call(`/api/plan-reviews/received/${id}`, teacher)).status, 404, 'not before it is sent')
  const set = await call(`/api/plan-reviews/${id}/report`, supervisor, { method: 'PUT', body: JSON.stringify({ levels: { '1c': 4 }, comments: 'Nice build.' }) })
  assert.equal(set.body.report.planning[0].level, 4)
  assert.equal((await call(`/api/plan-reviews/${id}/send`, supervisor, post({}))).status, 200)
  const received = await call(`/api/plan-reviews/received/${id}`, teacher)
  assert.equal(received.status, 200)
  assert.equal(received.body.report.comments, 'Nice build.')
  assert.equal(received.body.reviewerName, 'Assistant Principal')
  assert.equal((await call(`/api/plan-reviews/received/${id}`, colleague)).status, 404)
  assert.equal(((await call('/api/plan-reviews/received', teacher)).body as unknown[]).length, 1)
  assert.equal((await call(`/api/plan-reviews/${id}`, supervisor, { method: 'DELETE' })).status, 200)
  assert.equal((await call(`/api/plan-reviews/received/${id}`, teacher)).status, 404)
})

test('two devices: recording on one, notes from either, kept when the questions are sent', async () => {
  const { supervisor, teacher, colleague } = ctx!.ids
  const o = (await call('/api/observations', supervisor, post({}))).body
  assert.equal(o.sessionStatus, 'setup', 'not recording anywhere yet')
  const started = (await call(`/api/observations/${o.id}`, supervisor, { method: 'PATCH', body: JSON.stringify({ recording: true }) })).body
  assert.equal(started.sessionStatus, 'recording', 'the other device can see it is recording')

  const a = await call(`/api/observations/${o.id}/notes`, supervisor, post({ text: 'Objective on the board', code: '3a' }))
  assert.equal(a.status, 201)
  const b = await call(`/api/observations/${o.id}/notes`, supervisor, post({ text: 'Back table off task', code: 'zz' }))
  assert.equal(b.body.notes.length, 2, 'notes from either device add up')
  assert.equal(b.body.notes.find((n: { text: string }) => n.text === 'Back table off task').code, null, 'only real components')
  assert.equal((await call(`/api/observations/${o.id}/notes`, colleague, post({ text: 'x' }))).status, 403)
  assert.equal((await call(`/api/observations/${o.id}/notes`, supervisor, post({ text: '   ' }))).status, 400)

  const gone = await call(`/api/observations/${o.id}/notes/${a.body.notes[0].id}`, supervisor, { method: 'DELETE' })
  assert.deepEqual(gone.body.notes.map((n: { text: string }) => n.text), ['Back table off task'])

  // The questions, sent without the notes: the saved notes stay.
  await call(`/api/observations/${o.id}`, supervisor, { method: 'PATCH', body: JSON.stringify({ teacherId: teacher }) })
  const answered = await call(`/api/observations/${o.id}/answers`, supervisor, post({ answers: { climate: 'warm' } }))
  assert.equal(answered.status, 202)
  assert.deepEqual(answered.body.notes.map((n: { text: string }) => n.text), ['Back table off task'])
  // The draft check it starts in the background (still recording: it waits)
  // finishes before the database closes.
  await new Promise((r) => setTimeout(r, 300))
})
