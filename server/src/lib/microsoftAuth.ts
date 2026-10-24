// Sign in with Microsoft (Microsoft Entra ID, school and personal accounts):
// the authorization-code flow with PKCE, and checking the id_token Microsoft
// returns. The routes are in routes/microsoftAuth.ts.
//
// The one rule that matters: Microsoft's `email` claim is whatever the
// account's tenant says it is, and anyone can make a tenant. Matching a
// Microsoft sign-in to an existing Wivoza account by that email alone would
// let a stranger take the account over (the "nOAuth" problem). So an account
// is recognised by its permanent tenant + object id, and an email is trusted
// only when Microsoft says the domain is verified (`xms_edov`) or the account
// is a personal Microsoft account, whose email Microsoft itself verified.

import { createHash, createPublicKey, randomBytes, type KeyObject } from 'node:crypto'
import jwt from 'jsonwebtoken'

/// Personal Microsoft accounts (Outlook.com, Hotmail) all sign in through this
/// one tenant.
export const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad'

const AUTHORITY = 'https://login.microsoftonline.com/common'

export type MicrosoftApp = { clientId: string; clientSecret: string; redirectUri: string }

/// Null until MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set; the
/// sign-in button is hidden until then.
export function microsoftApp(redirectUri: string): MicrosoftApp | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim()
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret, redirectUri } : null
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export function authorizeUrl(app: MicrosoftApp, p: { state: string; nonce: string; challenge: string }): string {
  const url = new URL(`${AUTHORITY}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', app.redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('state', p.state)
  url.searchParams.set('nonce', p.nonce)
  url.searchParams.set('code_challenge', p.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  // A shared school computer is often signed in to someone else's account.
  url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

export class MicrosoftAuthError extends Error {}

/// Swaps the code for tokens; only the id_token is kept.
export async function exchangeCode(app: MicrosoftApp, code: string, verifier: string, doFetch: typeof fetch = fetch): Promise<string> {
  const res = await doFetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: app.redirectUri,
      code_verifier: verifier,
      scope: 'openid profile email',
    }),
    signal: AbortSignal.timeout(15000),
  })
  const body = (await res.json().catch(() => null)) as { id_token?: string; error_description?: string; error?: string } | null
  if (!res.ok || !body?.id_token) throw new MicrosoftAuthError(body?.error_description ?? body?.error ?? `Microsoft refused the sign-in (${res.status}).`)
  return body.id_token
}

type Jwk = { kid?: string; [key: string]: unknown }
let keysCache: { keys: Jwk[]; at: number } | null = null

async function signingKey(kid: string | undefined, fetchKeys: () => Promise<Jwk[]>): Promise<KeyObject> {
  const find = (keys: Jwk[]) => keys.find((k) => k.kid === kid)
  let key = keysCache && Date.now() - keysCache.at < 60 * 60 * 1000 ? find(keysCache.keys) : undefined
  if (!key) {
    // An unknown kid is Microsoft rotating its keys: fetch again.
    keysCache = { keys: await fetchKeys(), at: Date.now() }
    key = find(keysCache.keys)
  }
  if (!key) throw new MicrosoftAuthError('The sign-in was signed with a key Microsoft does not publish.')
  return createPublicKey({ key: key as never, format: 'jwk' })
}

async function fetchMicrosoftKeys(): Promise<Jwk[]> {
  const res = await fetch(`${AUTHORITY}/discovery/v2.0/keys`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new MicrosoftAuthError(`Microsoft's signing keys could not be read (${res.status}).`)
  return ((await res.json()) as { keys?: Jwk[] }).keys ?? []
}

export type MicrosoftIdentity = {
  /** "<tid>:<oid>", what the account is recognised by. */
  microsoftId: string
  name: string | null
  email: string | null
  /** The email may be matched to or used for a Wivoza account. */
  emailVerified: boolean
}

/// Checks the id_token — Microsoft's signature, for Wivoza, from the tenant it
/// names, unexpired, with our nonce — and reads who signed in.
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  nonce: string,
  fetchKeys: () => Promise<Jwk[]> = fetchMicrosoftKeys,
): Promise<MicrosoftIdentity> {
  const decoded = jwt.decode(idToken, { complete: true })
  if (!decoded || typeof decoded.payload === 'string') throw new MicrosoftAuthError('Microsoft did not return a signed sign-in.')
  const tid = (decoded.payload as jwt.JwtPayload).tid
  if (typeof tid !== 'string' || !/^[0-9a-f-]{36}$/i.test(tid)) throw new MicrosoftAuthError('The sign-in did not say which organization it came from.')
  const key = await signingKey(decoded.header.kid, fetchKeys)

  let p: jwt.JwtPayload
  try {
    // The multi-tenant issuer names the account's own tenant, so it is
    // checked against the tid inside the same signed token.
    p = jwt.verify(idToken, key, { algorithms: ['RS256'], audience: clientId, issuer: `https://login.microsoftonline.com/${tid}/v2.0`, clockTolerance: 60 }) as jwt.JwtPayload
  } catch (error) {
    throw new MicrosoftAuthError(`The sign-in could not be verified: ${(error as Error).message}`)
  }
  if (p.nonce !== nonce) throw new MicrosoftAuthError('The sign-in did not match the one that started it.')
  if (typeof p.oid !== 'string' || !p.oid) throw new MicrosoftAuthError('The sign-in did not say who you are.')

  const email = typeof p.email === 'string' && p.email.includes('@') ? p.email.trim().toLowerCase() : null
  const domainVerified = p.xms_edov === true || p.xms_edov === 'true' || p.xms_edov === 1 || p.xms_edov === '1'
  return {
    microsoftId: `${tid}:${p.oid}`,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null,
    email,
    emailVerified: !!email && (tid === CONSUMER_TENANT || domainVerified),
  }
}

/// Where to send the browser after sign-in: a path on this site, nothing
/// else — "//elsewhere.com" and absolute URLs become "/".
export function safeNext(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.length > 500) return '/'
  return value
}
