import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken'
import { createPublicKey } from 'node:crypto'

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys'
const APPLE_ISSUER = 'https://appleid.apple.com'
// Apple rotates signing keys infrequently — refetching hourly avoids a
// network round-trip on every sign-in without risking a stale key for long.
const CACHE_TTL_MS = 60 * 60 * 1000

interface AppleJwk {
  kty: string
  kid: string
  use: string
  alg: string
  n: string
  e: string
}

let cachedKeys: AppleJwk[] | null = null
let cachedAt = 0

async function getApplePublicKeys(): Promise<AppleJwk[]> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKeys
  const res = await fetch(APPLE_KEYS_URL)
  if (!res.ok) throw new Error(`Failed to fetch Apple JWKS: ${res.status}`)
  const body = (await res.json()) as { keys: AppleJwk[] }
  cachedKeys = body.keys
  cachedAt = Date.now()
  return cachedKeys
}

// Verifies a Sign in with Apple identity token from the native iOS app.
// For a native app, `aud` is the app's own Bundle ID — no separate
// "Services ID" is needed the way web Sign in with Apple requires one.
// See https://developer.apple.com/documentation/sign_in_with_apple/verifying_a_user
export async function verifyAppleIdentityToken(token: string, audience: string): Promise<JwtPayload> {
  const decoded = jwt.decode(token, { complete: true })
  if (!decoded || typeof decoded === 'string') throw new Error('Malformed Apple identity token')

  const { kid } = decoded.header as JwtHeader
  if (!kid) throw new Error('Apple identity token missing key id')

  const keys = await getApplePublicKeys()
  const jwk = keys.find((k) => k.kid === kid)
  if (!jwk) throw new Error('No matching Apple signing key found')

  const publicKey = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' })
  const pem = publicKey.export({ type: 'spki', format: 'pem' })

  return new Promise((resolve, reject) => {
    jwt.verify(token, pem, { algorithms: ['RS256'], issuer: APPLE_ISSUER, audience }, (err, payload) => {
      if (err || !payload || typeof payload === 'string') {
        reject(err ?? new Error('Invalid Apple identity token'))
        return
      }
      resolve(payload)
    })
  })
}
