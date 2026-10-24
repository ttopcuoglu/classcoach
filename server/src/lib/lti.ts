// Canvas over LTI 1.3: the parts that are protocol rather than routes — the
// developer-key configuration Canvas reads, where each Canvas environment
// signs people in, who counts as staff, and checking the signed launch.
//
// Launch flow (routes/lti.ts): Canvas sends the browser to /login; we send it
// on to Canvas's authorize endpoint with a state and nonce; Canvas posts a
// signed id_token back to /launch; we check it against Canvas's public keys
// and sign the teacher in. Every placement opens in a new tab, so the whole
// flow is a top-level page and cookies behave normally.

import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'
import jwt from 'jsonwebtoken'

// ---------------------------------------------------------------------------
// Where Canvas lives
// ---------------------------------------------------------------------------

/// Instructure-hosted Canvas. The issuer is the same whatever the school's
/// own Canvas address is; the environment is which Canvas the school's key
/// was made in (almost always production).
export const CANVAS_ENVIRONMENTS = {
  production: {
    issuer: 'https://canvas.instructure.com',
    authUrl: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
    jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks',
  },
  beta: {
    issuer: 'https://canvas.beta.instructure.com',
    authUrl: 'https://sso.beta.canvaslms.com/api/lti/authorize_redirect',
    jwksUrl: 'https://sso.beta.canvaslms.com/api/lti/security/jwks',
  },
  test: {
    issuer: 'https://canvas.test.instructure.com',
    authUrl: 'https://sso.test.canvaslms.com/api/lti/authorize_redirect',
    jwksUrl: 'https://sso.test.canvaslms.com/api/lti/security/jwks',
  },
} as const
export type CanvasEnvironment = keyof typeof CANVAS_ENVIRONMENTS

export function isCanvasEnvironment(value: unknown): value is CanvasEnvironment {
  return typeof value === 'string' && value in CANVAS_ENVIRONMENTS
}

// ---------------------------------------------------------------------------
// The developer key's configuration
// ---------------------------------------------------------------------------

/// What a Canvas admin pastes the URL of when they create the developer key.
///
/// Course navigation only, with visibility "admins": in Canvas that shows the
/// link to teachers, TAs, designers and admins, never to students. Canvas's
/// global (left-hand) menu has no documented way to hide an item from
/// students, so Wivoza is deliberately not put there. `_blank` opens it in its
/// own tab: the microphone and Wivoza's sign-in cookie are unreliable inside
/// another site's frame.
export function canvasConfig(apiBase: string) {
  return {
    title: 'Wivoza',
    description: 'Instructional coaching for teachers: plan lessons, debrief recorded lessons, talk it through.',
    oidc_initiation_url: `${apiBase}/api/lti/login`,
    target_link_uri: `${apiBase}/api/lti/launch`,
    public_jwk_url: `${apiBase}/api/lti/jwks`,
    scopes: [],
    extensions: [
      {
        platform: 'canvas.instructure.com',
        privacy_level: 'name_only',
        settings: {
          text: 'Wivoza',
          placements: [
            {
              placement: 'course_navigation',
              message_type: 'LtiResourceLinkRequest',
              target_link_uri: `${apiBase}/api/lti/launch`,
              text: 'Wivoza',
              visibility: 'admins',
              default: 'enabled',
              windowTarget: '_blank',
            },
          ],
        },
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Who may launch
// ---------------------------------------------------------------------------

/// LIS role names that mean staff: someone who teaches or runs a course or
/// the school. Matched on the part after "#", so the context and institution
/// forms of a role (…/membership#Instructor, …/person#Instructor) both count,
/// and so does a sub-role (…#Instructor#TeachingAssistant).
const STAFF_ROLES = new Set(['Instructor', 'TeachingAssistant', 'ContentDeveloper', 'Administrator', 'Faculty', 'Staff', 'Mentor', 'SysAdmin'])

export function isStaff(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false
  return roles.some((role) => {
    if (typeof role !== 'string') return false
    const parts = role.split('#').slice(1)
    return parts.some((part) => STAFF_ROLES.has(part))
  })
}

// ---------------------------------------------------------------------------
// The tool's own key
// ---------------------------------------------------------------------------

/// Canvas requires a public key on every developer key, even though a
/// launch-only tool never signs anything Canvas reads. LTI_PRIVATE_KEY (PEM)
/// keeps it stable across deploys; without it a key is made at boot, which
/// is fine until Wivoza calls a Canvas service (Deep Linking, sending pages).
let toolKey: { privateKey: KeyObject; publicJwk: Record<string, unknown> } | null = null

export function getToolKey() {
  if (toolKey) return toolKey
  const pem = process.env.LTI_PRIVATE_KEY?.replace(/\\n/g, '\n')
  let privateKey: KeyObject
  if (pem) {
    privateKey = createPrivateKey(pem)
  } else {
    console.warn('[lti] LTI_PRIVATE_KEY is not set — using a key made at boot')
    privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  }
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as Record<string, unknown>
  toolKey = { privateKey, publicJwk: { ...jwk, kid: 'wivoza-lti-1', alg: 'RS256', use: 'sig' } }
  return toolKey
}

// ---------------------------------------------------------------------------
// Checking a launch
// ---------------------------------------------------------------------------

export type LtiClaims = {
  sub: string
  name: string | null
  roles: string[]
  deploymentId: string
  courseTitle: string | null
}

export class LtiLaunchError extends Error {}

const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/'

type Jwk = { kid?: string; kty: string; [key: string]: unknown }
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>()
const JWKS_TTL_MS = 60 * 60 * 1000

async function canvasKey(jwksUrl: string, kid: string | undefined, fetchJwks: (url: string) => Promise<Jwk[]>): Promise<KeyObject> {
  const find = (keys: Jwk[]) => keys.find((k) => k.kid === kid) ?? (kid ? undefined : keys[0])
  const cached = jwksCache.get(jwksUrl)
  let key = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS ? find(cached.keys) : undefined
  // A kid we have not seen is Canvas rotating its keys: fetch again rather
  // than refuse a launch that is genuinely Canvas's.
  if (!key) {
    const keys = await fetchJwks(jwksUrl)
    jwksCache.set(jwksUrl, { keys, fetchedAt: Date.now() })
    key = find(keys)
  }
  if (!key) throw new LtiLaunchError('The launch was signed with a key Canvas does not publish.')
  return createPublicKey({ key: key as never, format: 'jwk' })
}

export async function fetchJwksOverHttp(url: string): Promise<Jwk[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new LtiLaunchError(`Canvas's signing keys could not be read (${res.status}).`)
  const body = (await res.json()) as { keys?: Jwk[] }
  return body.keys ?? []
}

/// Checks a launch's id_token: Canvas's signature, that it is for this
/// install, unexpired, carries the nonce we sent, and is an ordinary launch.
/// Returns the few claims Wivoza uses.
export async function verifyLaunch(
  idToken: string,
  platform: { issuer: string; clientId: string; jwksUrl: string },
  nonce: string,
  fetchJwks: (url: string) => Promise<Jwk[]> = fetchJwksOverHttp,
): Promise<LtiClaims> {
  const decoded = jwt.decode(idToken, { complete: true })
  if (!decoded || typeof decoded.payload === 'string') throw new LtiLaunchError('The launch was not a signed token.')
  const key = await canvasKey(platform.jwksUrl, decoded.header.kid, fetchJwks)

  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(idToken, key, {
      algorithms: ['RS256'],
      issuer: platform.issuer,
      audience: platform.clientId,
      clockTolerance: 60,
    }) as jwt.JwtPayload
  } catch (error) {
    throw new LtiLaunchError(`The launch could not be verified: ${(error as Error).message}`)
  }

  if (payload.nonce !== nonce) throw new LtiLaunchError('The launch did not match the sign-in that started it.')
  // With several audiences, the one we are must be the authorized party.
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== platform.clientId) {
    throw new LtiLaunchError('The launch was meant for a different tool.')
  }
  if (payload[`${CLAIM}message_type`] !== 'LtiResourceLinkRequest') throw new LtiLaunchError('Wivoza only opens from a link in Canvas.')
  if (payload[`${CLAIM}version`] !== '1.3.0') throw new LtiLaunchError('This Canvas sent an LTI version Wivoza does not speak.')
  const deploymentId = payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
  if (typeof deploymentId !== 'string' || !deploymentId) throw new LtiLaunchError('The launch did not say which install it came from.')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new LtiLaunchError('The launch did not say who you are.')

  const context = payload[`${CLAIM}context`] as { title?: unknown } | undefined
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : null
  return {
    sub: payload.sub,
    name,
    roles: Array.isArray(payload[`${CLAIM}roles`]) ? (payload[`${CLAIM}roles`] as string[]) : [],
    deploymentId,
    courseTitle: typeof context?.title === 'string' ? context.title : null,
  }
}

/// Where the browser goes at step two: Canvas's own sign-in, which posts the
/// id_token back to our launch URL.
export function authRedirectUrl(
  platform: { authUrl: string; clientId: string },
  params: { redirectUri: string; loginHint: string; messageHint: string | null; state: string; nonce: string },
): string {
  const url = new URL(platform.authUrl)
  url.searchParams.set('scope', 'openid')
  url.searchParams.set('response_type', 'id_token')
  url.searchParams.set('response_mode', 'form_post')
  url.searchParams.set('prompt', 'none')
  url.searchParams.set('client_id', platform.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('login_hint', params.loginHint)
  if (params.messageHint) url.searchParams.set('lti_message_hint', params.messageHint)
  url.searchParams.set('state', params.state)
  url.searchParams.set('nonce', params.nonce)
  return url.toString()
}

// ---------------------------------------------------------------------------
// Any LTI 1.3 LMS
// ---------------------------------------------------------------------------

export const LMS_KINDS = ['canvas', 'schoology', 'brightspace', 'moodle', 'blackboard'] as const
export type LmsKind = (typeof LMS_KINDS)[number]

export const LMS_LABEL: Record<LmsKind, string> = {
  canvas: 'Canvas',
  schoology: 'Schoology',
  brightspace: 'Brightspace',
  moodle: 'Moodle',
  blackboard: 'Blackboard',
}

export function isLmsKind(value: unknown): value is LmsKind {
  return typeof value === 'string' && (LMS_KINDS as readonly string[]).includes(value)
}

/// Schoology and Blackboard register a tool once, with its maker: Wivoza's
/// own app there has one client id that every school installs. Their
/// sign-in endpoints are the same for every school. Null until Wivoza's app
/// is registered and its id is in the environment.
export function vendorApp(lms: 'schoology' | 'blackboard'): { issuer: string; clientId: string; authUrl: string; jwksUrl: string } | null {
  if (lms === 'schoology') {
    const clientId = process.env.LTI_SCHOOLOGY_CLIENT_ID?.trim()
    return clientId
      ? {
          issuer: 'https://schoology.schoology.com',
          clientId,
          authUrl: 'https://lti-service.svc.schoology.com/lti-service/authorize-redirect',
          jwksUrl: 'https://lti-service.svc.schoology.com/lti-service/.well-known/jwks',
        }
      : null
  }
  const appId = process.env.LTI_BLACKBOARD_APP_ID?.trim()
  return appId
    ? {
        issuer: 'https://blackboard.com',
        clientId: appId,
        authUrl: 'https://developer.blackboard.com/api/v1/gateway/oidcauth',
        jwksUrl: `https://developer.blackboard.com/api/v1/management/applications/${encodeURIComponent(appId)}/jwks.json`,
      }
    : null
}

/// An https address an admin pasted (a Moodle or Brightspace endpoint), as
/// given minus surrounding spaces. Null for anything else.
export function cleanHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null
    return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/')
  } catch {
    return null
  }
}

/// An issuer is compared exactly with the one in every launch, so it is
/// kept exactly as the LMS shows it — only surrounding spaces go.
export function cleanIssuer(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^https:\/\/[^\s/]+\.[^\s]*$/.test(trimmed) && trimmed.length <= 300 ? trimmed : null
}

/// Client ids differ by LMS: Canvas's are numbers, Moodle's short random
/// strings, Brightspace's and Blackboard's GUIDs.
export function cleanClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[A-Za-z0-9._:-]{1,200}$/.test(trimmed) ? trimmed : null
}

/// Deployment ids are opaque strings ("3376:eb4a20…" in Canvas, a GUID or a
/// number elsewhere): any visible characters, no spaces.
export function cleanDeploymentId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^[\x21-\x7e]{1,255}$/.test(trimmed) ? trimmed : null
}

/// Which school a launch belongs to, among the installs sharing its issuer
/// and client id: the one for its exact deployment, else the one that takes
/// any deployment of that client id. Never a guess between two schools.
export function choosePlatform<T extends { deploymentId: string | null }>(candidates: T[], deploymentId: string | null): T | null {
  if (deploymentId) {
    const exact = candidates.find((c) => c.deploymentId === deploymentId)
    if (exact) return exact
  }
  const open = candidates.filter((c) => !c.deploymentId)
  return open.length === 1 ? open[0] : null
}
