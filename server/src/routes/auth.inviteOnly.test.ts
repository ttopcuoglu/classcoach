// Invite-only sign-up: a new account needs a school's join code, unless its
// email is already on a school's admin list. Tested against a throwaway
// in-memory Postgres (PGlite), never a real one. Same harness as
// leaders.privacy.test.ts. Only email sign-up is driven here; Google, Apple
// and Microsoft call the same admitNewAccount before creating anyone.

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

// Before anything can load server/.env (which points at production).
process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none'
process.env.STRIPE_SECRET_KEY ??= 'sk_test_invite_dummy'
process.env.JWT_SECRET ??= 'invite-test-only'
process.env.DATABASE_POOL_MAX = '1'
process.env.ANTHROPIC_API_KEY ??= 'invite-test-only'

const SERVER_SRC = join(import.meta.dirname, '..')

type Ctx = { base: string; orgId: string; stop: () => Promise<void> }
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
    const { authRouter } = await import('./auth.ts')

    const org = await prisma.organization.create({
      data: { name: 'Maple Ridge Academy', joinCode: 'MAPLE2', adminEmails: 'principal@test.example' },
    })

    const app = express()
    app.use(express.json())
    app.use('/api/auth', authRouter)
    const server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', () => resolve()))
    const { port: httpPort } = server.address() as AddressInfo

    ctx = {
      base: `http://127.0.0.1:${httpPort}`,
      orgId: org.id,
      stop: async () => {
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await prisma.$disconnect()
        await socket.stop()
        await db.close()
      },
    }
  } catch (error) {
    await abandon(error)
  }
})

after(async () => {
  await ctx?.stop()
})

function signUp(email: string, joinCode?: string) {
  return fetch(`${ctx!.base}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'long-enough-1', name: 'Test Teacher', termsAccepted: true, ageConfirmed: true, joinCode }),
  })
}

test('no code: refused, and no account is made', async (t) => {
  if (skipReason) return t.skip(skipReason)
  const res = await signUp('nocode@test.example')
  assert.equal(res.status, 403)
  const body = await res.json()
  assert.equal(body.codeRequired, true)
  assert.match(body.error, /invite-only/)
  const { prisma } = await import('../lib/prisma.ts')
  assert.equal(await prisma.user.count({ where: { email: 'nocode@test.example' } }), 0)
})

test('a wrong code: refused', async (t) => {
  if (skipReason) return t.skip(skipReason)
  const res = await signUp('wrong@test.example', 'NOPE99')
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /wasn't recognized/)
})

test('a valid code: the account joins that school as a teacher', async (t) => {
  if (skipReason) return t.skip(skipReason)
  const res = await signUp('teacher@test.example', ' maple2 ')
  assert.equal(res.status, 201)
  const user = await res.json()
  assert.equal(user.organizationId, ctx!.orgId)
  assert.equal(user.role, 'teacher')
})

test("an email on a school's admin list needs no code", async (t) => {
  if (skipReason) return t.skip(skipReason)
  const res = await signUp('principal@test.example')
  assert.equal(res.status, 201)
  const user = await res.json()
  assert.equal(user.organizationId, ctx!.orgId)
  assert.equal(user.role, 'org_admin')
})
