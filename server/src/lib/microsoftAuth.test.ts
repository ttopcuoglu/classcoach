import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import { authorizeUrl, CONSUMER_TENANT, MicrosoftAuthError, pkcePair, safeNext, verifyIdToken } from './microsoftAuth.ts'

// A stand-in for Microsoft: its key, its key list, and sign-ins signed with
// it. The email rules are the point: an unverified email must never be
// trusted, because anyone can create a Microsoft tenant and set any email.

const ms = generateKeyPairSync('rsa', { modulusLength: 2048 })
const keys = async () => [{ ...(ms.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'ms-1' }]
const CLIENT = '11111111-2222-3333-4444-555555555555'
const SCHOOL_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function idToken(claims: Record<string, unknown> = {}, tid = SCHOOL_TENANT, issuerTid = tid) {
  return jwt.sign({ tid, oid: 'object-1', nonce: 'n-1', name: 'Jordan Rivera', email: 'Jordan@School.org', ...claims }, ms.privateKey, {
    algorithm: 'RS256',
    keyid: 'ms-1',
    audience: CLIENT,
    issuer: `https://login.microsoftonline.com/${issuerTid}/v2.0`,
    ...('exp' in claims ? {} : { expiresIn: 300 }),
  })
}

test('a school account with a verified domain is trusted, by its permanent id', async () => {
  const who = await verifyIdToken(idToken({ xms_edov: true }), CLIENT, 'n-1', keys)
  assert.deepEqual(who, { microsoftId: `${SCHOOL_TENANT}:object-1`, name: 'Jordan Rivera', email: 'jordan@school.org', emailVerified: true })
})

test("a school account whose domain Microsoft hasn't verified is not trusted by email", async () => {
  const who = await verifyIdToken(idToken(), CLIENT, 'n-1', keys)
  assert.equal(who.emailVerified, false)
  assert.equal((await verifyIdToken(idToken({ xms_edov: false }), CLIENT, 'n-1', keys)).emailVerified, false)
})

test("a personal Microsoft account's email is Microsoft's own, so it is trusted", async () => {
  const who = await verifyIdToken(idToken({ email: 'teacher@outlook.com' }, CONSUMER_TENANT), CLIENT, 'n-1', keys)
  assert.equal(who.emailVerified, true)
  assert.equal(who.microsoftId, `${CONSUMER_TENANT}:object-1`)
})

test('no email means nothing to match or create by', async () => {
  const who = await verifyIdToken(idToken({ email: undefined, xms_edov: true }), CLIENT, 'n-1', keys)
  assert.equal(who.email, null)
  assert.equal(who.emailVerified, false)
})

test('sign-ins that must be refused are refused', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const cases: [string, string][] = [
    ['wrong nonce', idToken({ nonce: 'other' })],
    ['for another app', jwt.sign({ tid: SCHOOL_TENANT, oid: 'o', nonce: 'n-1' }, ms.privateKey, { algorithm: 'RS256', keyid: 'ms-1', audience: 'someone-else', issuer: `https://login.microsoftonline.com/${SCHOOL_TENANT}/v2.0` })],
    ["issuer of another tenant than the token's own", idToken({}, SCHOOL_TENANT, '99999999-8888-7777-6666-555555555555')],
    ['expired', idToken({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['signed by someone else', jwt.sign({ tid: SCHOOL_TENANT, oid: 'o', nonce: 'n-1' }, other.privateKey, { algorithm: 'RS256', keyid: 'ms-1', audience: CLIENT, issuer: `https://login.microsoftonline.com/${SCHOOL_TENANT}/v2.0` })],
    ['no object id', idToken({ oid: undefined })],
    ['no tenant', jwt.sign({ oid: 'o', nonce: 'n-1' }, ms.privateKey, { algorithm: 'RS256', keyid: 'ms-1', audience: CLIENT, issuer: 'https://login.microsoftonline.com/x/v2.0' })],
  ]
  for (const [name, token] of cases) {
    await assert.rejects(verifyIdToken(token, CLIENT, 'n-1', keys), MicrosoftAuthError, name)
  }
})

test('the sign-in link asks for an id token with PKCE and an account picker', () => {
  const { verifier, challenge } = pkcePair()
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'))
  const url = new URL(authorizeUrl({ clientId: CLIENT, clientSecret: 's', redirectUri: 'https://www.wivoza.com/api/auth/microsoft/callback' }, { state: 'st', nonce: 'no', challenge }))
  assert.equal(url.origin + url.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
  for (const [k, v] of Object.entries({ response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', state: 'st', nonce: 'no', prompt: 'select_account', scope: 'openid profile email' })) {
    assert.equal(url.searchParams.get(k), v, k)
  }
})

test('after sign-in the browser only ever goes to a page on this site', () => {
  assert.equal(safeNext('/lti/connect?token=abc'), '/lti/connect?token=abc')
  assert.equal(safeNext('//evil.example'), '/')
  assert.equal(safeNext('/\\evil.example'), '/')
  assert.equal(safeNext('https://evil.example'), '/')
  assert.equal(safeNext(undefined), '/')
})
