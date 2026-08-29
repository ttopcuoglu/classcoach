import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — sign-in will fail. Add it to server/.env')
}

export const SESSION_COOKIE = 'session'

// Pass to any Prisma User query/mutation that ends in res.json(user) — the
// hash must never reach the browser.
export const SAFE_USER_OMIT = { passwordHash: true } as const

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
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET ?? '', { expiresIn: '30d' })
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET ?? '') as SessionPayload
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

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE]
  const session = typeof token === 'string' ? verifySession(token) : null
  if (!session) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  req.user = session
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
