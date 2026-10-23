import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import { authRedirectUrl, CANVAS_ENVIRONMENTS, canvasConfig, getToolKey, isStaff, LtiLaunchError, verifyLaunch } from './lti.ts'

// A stand-in for Canvas: its own key pair, its JWKS, and launches signed with
// it. Every check verifyLaunch makes is one a forged or replayed launch would
// otherwise get past.

const canvas = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'canvas-key-1'
const jwks = async () => [{ ...(canvas.publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: KID, kty: 'RSA' }]

const PLATFORM = { issuer: CANVAS_ENVIRONMENTS.production.issuer, clientId: '10000000000123', jwksUrl: 'https://example.test/jwks-' + Math.random() }
const C = 'https://purl.imsglobal.org/spec/lti/claim/'

function launch(overrides: Record<string, unknown> = {}, options: jwt.SignOptions = {}) {
  return jwt.sign(
    {
      nonce: 'n-1',
      sub: 'canvas-user-42',
      name: 'Jordan Rivera',
      [`${C}message_type`]: 'LtiResourceLinkRequest',
      [`${C}version`]: '1.3.0',
      [`${C}deployment_id`]: '7:abc',
      [`${C}roles`]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      [`${C}context`]: { id: 'c1', title: 'Algebra 2 — Period 3' },
      ...overrides,
    },
    canvas.privateKey,
    // An `exp` in the claims means no expiresIn: jsonwebtoken refuses both.
    { algorithm: 'RS256', keyid: KID, issuer: PLATFORM.issuer, audience: PLATFORM.clientId, ...('exp' in overrides ? {} : { expiresIn: 300 }), ...options },
  )
}

test('a genuine launch is accepted and its claims read', async () => {
  const claims = await verifyLaunch(launch(), PLATFORM, 'n-1', jwks)
  assert.deepEqual(claims, {
    sub: 'canvas-user-42',
    name: 'Jordan Rivera',
    roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    deploymentId: '7:abc',
    courseTitle: 'Algebra 2 — Period 3',
  })
})

test('launches that must be refused are refused', async () => {
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const cases: [string, string][] = [
    ['wrong nonce', launch({ nonce: 'someone-else' })],
    ['wrong audience', launch({}, { audience: '999' })],
    ['wrong issuer', launch({}, { issuer: 'https://evil.example' })],
    ['expired', launch({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ['deep linking, not a link', launch({ [`${C}message_type`]: 'LtiDeepLinkingRequest' })],
    ['no deployment', launch({ [`${C}deployment_id`]: undefined })],
    ['another key', jwt.sign({ nonce: 'n-1', sub: 'x' }, other.privateKey, { algorithm: 'RS256', keyid: KID, issuer: PLATFORM.issuer, audience: PLATFORM.clientId })],
    ['unsigned', jwt.sign({ nonce: 'n-1', sub: 'x' }, 'shared-secret', { algorithm: 'HS256', keyid: KID, issuer: PLATFORM.issuer, audience: PLATFORM.clientId })],
  ]
  for (const [name, token] of cases) {
    await assert.rejects(verifyLaunch(token, PLATFORM, 'n-1', jwks), LtiLaunchError, name)
  }
})

test('staff can launch; students cannot', () => {
  assert.ok(isStaff(['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor']))
  assert.ok(isStaff(['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Faculty']))
  assert.ok(isStaff(['http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant']))
  assert.ok(isStaff(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner', 'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator']))
  assert.ok(!isStaff(['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']))
  assert.ok(!isStaff(['http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student']))
  assert.ok(!isStaff([]))
  assert.ok(!isStaff('Instructor'))
})

test('the developer key puts Wivoza only where students cannot see it, in its own tab', () => {
  const config = canvasConfig('https://www.wivoza.com')
  const placements = config.extensions[0].settings.placements
  assert.deepEqual(placements.map((p) => p.placement), ['course_navigation'])
  assert.equal(placements[0].visibility, 'admins')
  assert.equal(placements[0].windowTarget, '_blank')
  assert.equal(config.oidc_initiation_url, 'https://www.wivoza.com/api/lti/login')
  assert.equal(config.extensions[0].privacy_level, 'name_only')
})

test("the tool's public key is published without its private half", () => {
  const { publicJwk } = getToolKey()
  assert.equal(publicJwk.kty, 'RSA')
  assert.ok(publicJwk.n && publicJwk.e)
  assert.equal(publicJwk.d, undefined)
})

test("the sign-in redirect carries what Canvas's authorize endpoint needs", () => {
  const url = new URL(
    authRedirectUrl(
      { authUrl: CANVAS_ENVIRONMENTS.production.authUrl, clientId: '10000000000123' },
      { redirectUri: 'https://www.wivoza.com/api/lti/launch', loginHint: 'h', messageHint: 'm', state: 's', nonce: 'n' },
    ),
  )
  assert.equal(url.origin + url.pathname, 'https://sso.canvaslms.com/api/lti/authorize_redirect')
  for (const [k, v] of Object.entries({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: '10000000000123',
    redirect_uri: 'https://www.wivoza.com/api/lti/launch',
    login_hint: 'h',
    lti_message_hint: 'm',
    state: 's',
    nonce: 'n',
  })) {
    assert.equal(url.searchParams.get(k), v, k)
  }
})
