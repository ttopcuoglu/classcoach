import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
  console.warn('[auth] JWT_SECRET is not set — sign-in will fail. Add it to server/.env')
}

export const SESSION_COOKIE = 'session'

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
