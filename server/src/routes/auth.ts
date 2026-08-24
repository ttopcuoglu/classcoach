import { OAuth2Client } from 'google-auth-library'
import { Router } from 'express'
import { requireAuth, SESSION_COOKIE, signSession } from '../lib/auth.ts'
import { prisma } from '../lib/prisma.ts'

export const authRouter = Router()

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
if (!GOOGLE_CLIENT_ID) {
  console.warn('[auth] GOOGLE_CLIENT_ID is not set — Google sign-in will fail. Add it to server/.env')
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

const isProd = process.env.NODE_ENV === 'production'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  // Frontend and backend live on different Render subdomains in production,
  // so the cookie must be sent cross-site — 'none' requires 'secure: true'.
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
}

authRouter.post('/google', async (req, res) => {
  const { credential } = req.body ?? {}
  if (typeof credential !== 'string') {
    res.status(400).json({ error: 'credential is required' })
    return
  }

  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) {
      res.status(401).json({ error: 'Invalid Google credential' })
      return
    }

    const role = ADMIN_EMAILS.has(payload.email.toLowerCase()) ? 'admin' : 'teacher'

    const user = await prisma.user.upsert({
      where: { googleId: payload.sub },
      update: { email: payload.email, name: payload.name ?? null, role },
      create: { googleId: payload.sub, email: payload.email, name: payload.name ?? null, role },
    })

    const token = signSession({ userId: user.id, role: user.role })
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS)
    res.json(user)
  } catch (error) {
    console.error('[auth] Google sign-in failed:', error)
    res.status(401).json({ error: 'Could not verify Google credential' })
  }
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }
  res.json(user)
})

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS)
  res.json({ status: 'ok' })
})
