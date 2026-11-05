// Ending a school's agreement deletes its members' student-bearing data and
// the school, and nothing belonging to anyone else. Tested against a throwaway
// in-memory Postgres (PGlite), never a real one. Same harness as
// routes/auth.inviteOnly.test.ts.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// Before anything can load server/.env (which points at production).
process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_school_deletion_dummy'
process.env.JWT_SECRET ??= 'school-deletion-test-only'
process.env.DATABASE_POOL_MAX = '1'
process.env.ANTHROPIC_API_KEY ??= 'school-deletion-test-only'

const SERVER_SRC = join(import.meta.dirname, '..')

let stop: (() => Promise<void>) | null = null
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
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  assert.match(process.env.DATABASE_URL, /@127\.0\.0\.1:/, 'this test only ever runs against a local throwaway database')
  const { prisma } = await import('./prisma.ts')
  stop = async () => {
    await prisma.$disconnect()
    await socket.stop()
    await db.close()
  }
})

after(async () => {
  await stop?.()
})

async function seedTeacher(email: string, organizationId: string | null) {
  const { prisma } = await import('./prisma.ts')
  const user = await prisma.user.create({
    data: { email, organizationId, coachMemory: 'Works on wait time.', previousCoachMemory: 'Earlier note.' },
  })
  const session = await prisma.audioSession.create({ data: { userId: user.id } })
  await prisma.transcriptSegment.create({
    data: { sessionId: session.id, speakerLabel: 'Student', rawSpeakerTag: 'Speaker 1', text: 'Student-A said the answer is four.', startSec: 1, endSec: 3 },
  })
  await prisma.debrief.create({ data: { userId: user.id, incidentText: 'Jordan kept calling out.' } })
  await prisma.parentMessage.create({ data: { userId: user.id, tone: 'warm', draftText: 'Dear family of Jordan' } })
  await prisma.lessonPlan.create({ data: { userId: user.id, mode: 'build' } })
  return user
}

test('ending an agreement clears its members and leaves everyone else alone', async (t) => {
  if (skipReason) return t.skip(skipReason)
  const { prisma } = await import('./prisma.ts')
  const { endSchoolAgreement, previewSchoolDeletion } = await import('./schoolDataDeletion.ts')

  const ending = await prisma.organization.create({ data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE9' } })
  const staying = await prisma.organization.create({ data: { name: 'Oak Hill School', joinCode: 'OAKHL9' } })
  const leaving = await seedTeacher('leaving@test.example', ending.id)
  const other = await seedTeacher('other@test.example', staying.id)
  const independent = await seedTeacher('solo@test.example', null)

  const preview = await previewSchoolDeletion(ending.id)
  assert.equal(preview?.members.length, 1)
  assert.deepEqual(
    { ...preview!.members[0], userId: undefined },
    {
      userId: undefined,
      name: null,
      email: 'leaving@test.example',
      lessons: 1,
      conversations: 1,
      parentMessages: 1,
      conversationPrep: 0,
      conversationPlans: 0,
      assignmentSessions: 0,
      practice: 0,
      coachMemory: true,
    },
  )
  // A preview deletes nothing.
  assert.equal(await prisma.audioSession.count({ where: { userId: leaving.id } }), 1)

  const receipt = await endSchoolAgreement(ending.id, new Date('2026-11-05T12:00:00Z'))
  assert.equal(receipt?.organizationName, 'Maple Ridge Academy')
  assert.equal(receipt?.deletedAt, '2026-11-05T12:00:00.000Z')

  // The member: classroom data and memory gone, transcripts with it; the
  // account and their lesson plans kept, now independent.
  const after = await prisma.user.findUnique({ where: { id: leaving.id } })
  assert.ok(after, 'the account itself is kept')
  assert.equal(after.organizationId, null)
  assert.equal(after.coachMemory, null)
  assert.equal(after.previousCoachMemory, null)
  assert.equal(await prisma.audioSession.count({ where: { userId: leaving.id } }), 0)
  assert.equal(await prisma.transcriptSegment.count({ where: { session: { userId: leaving.id } } }), 0)
  assert.equal(await prisma.debrief.count({ where: { userId: leaving.id } }), 0)
  assert.equal(await prisma.parentMessage.count({ where: { userId: leaving.id } }), 0)
  assert.equal(await prisma.lessonPlan.count({ where: { userId: leaving.id } }), 1)
  assert.equal(await prisma.organization.count({ where: { id: ending.id } }), 0)

  // Everyone else: untouched.
  for (const user of [other, independent]) {
    assert.equal(await prisma.audioSession.count({ where: { userId: user.id } }), 1)
    assert.equal(await prisma.debrief.count({ where: { userId: user.id } }), 1)
    assert.equal(await prisma.parentMessage.count({ where: { userId: user.id } }), 1)
    assert.equal((await prisma.user.findUnique({ where: { id: user.id } }))?.coachMemory, 'Works on wait time.')
  }
  assert.equal(await prisma.organization.count({ where: { id: staying.id } }), 1)
})

test('an unknown school: nothing happens', async (t) => {
  if (skipReason) return t.skip(skipReason)
  const { endSchoolAgreement, previewSchoolDeletion } = await import('./schoolDataDeletion.ts')
  assert.equal(await previewSchoolDeletion('no-such-org'), null)
  assert.equal(await endSchoolAgreement('no-such-org'), null)
})
