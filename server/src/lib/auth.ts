import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — sign-in will fail. Add it to server/.env')
}

export const SESSION_COOKIE = 'session'

// Pass to any Prisma User query/mutation that ends in res.json(user) — the
// hash must never reach the browser, and neither should a pending Telegram
// link code (it is only ever handed out by POST /api/telegram/link).
export const SAFE_USER_OMIT = { passwordHash: true, telegramLinkToken: true } as const

// Pair with SAFE_USER_OMIT so the client can show which org (if any) a user
// belongs to, without exposing anything beyond the org's name.
export const USER_INCLUDE_ORG = { organization: { select: { name: true } } } as const

// Minimal login/signup attempt throttle. In-memory only — resets on every
// deploy/restart and won't coordinate across multiple instances if this app
// ever scales horizontally. A durable version would need Redis or a DB
// table; not worth that cost until this app has real attack traffic.
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_ATTEMPT_LIMIT = 10
const loginAttempts = new Map<string, { count: number; windowStart: number }>()

export function checkLoginRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now - entry.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= LOGIN_ATTEMPT_LIMIT
}

export type SessionPayload = {
  userId: string
  role: string
  // Present only on the short-lived socket token below. A session has none.
  scope?: 'stt'
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET ?? '', { expiresIn: '30d' })
}

// A WebSocket cannot set request headers, so the live-transcription socket
// has always accepted a token in the query string for native clients. The
// browser now needs the same door: in production the site reaches the API
// through a proxy that forwards cookies on ordinary requests but not on an
// upgrade, so a cookie-authenticated socket is refused every time.
//
// This is deliberately not the 30-day session token. It lives for a minute,
// is fetched over the HTTP path that does work, and is only good for
// opening a transcription socket — a query string is the one place a
// credential is most likely to be written down by something along the way.
const WS_TOKEN_TTL_SECONDS = 60

export function signWsToken(payload: SessionPayload): string {
  return jwt.sign({ ...payload, scope: 'stt' }, JWT_SECRET ?? '', { expiresIn: WS_TOKEN_TTL_SECONDS })
}

// `scope` decides what a token may be used for. A socket token is signed
// with the same secret as a session, so without this check it would also be
// a one-minute pass to the whole HTTP API — a credential that travels in a
// query string must not be worth that much.
export function verifySession(token: string, accept: 'session' | 'stt' = 'session'): SessionPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET ?? '') as SessionPayload
    if (accept === 'session' && payload.scope) return null
    return payload
  } catch {
    return null
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionPayload
    }
  }
}

// Browsers authenticate via the httpOnly session cookie above. Native
// clients (the iOS app) that don't share that cookie jar instead send the
// same signed token as `Authorization: Bearer <token>` — checked here as a
// fallback so the cookie-based web flow is completely unaffected.
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies?.[SESSION_COOKIE]
  const token = typeof cookieToken === 'string' ? cookieToken : bearerToken(req)
  const session = token ? verifySession(token) : null
  if (!session) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  req.user = session
  next()
}

// Passes for either admin tier — org_admin (scoped to their own
// organization) or superadmin (sees the whole platform) — only a plain
// teacher is rejected.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'teacher' || !req.user?.role) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

export function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ error: 'Superadmin access required' })
    return
  }
  next()
}
