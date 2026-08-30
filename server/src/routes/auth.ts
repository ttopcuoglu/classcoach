import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { Router } from 'express'
import {
  checkLoginRateLimit,
  requireAuth,
  SAFE_USER_OMIT,
  SESSION_COOKIE,
  signSession,
  USER_INCLUDE_ORG,
} from '../lib/auth.ts'
import { prisma } from '../lib/prisma.ts'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const PASSWORD_SALT_ROUNDS = 10
const GENERIC_LOGIN_ERROR = 'Invalid email or password.'

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

    const role = ADMIN_EMAILS.has(payload.email.toLowerCase()) ? 'superadmin' : 'teacher'

    // Find by googleId first; if this Google account has never signed in
    // here, check whether a password account already owns this email and
    // link Google onto it instead of trying to create a second row with the
    // same @unique email (which would otherwise throw once password
    // accounts exist).
    let user = await prisma.user.findUnique({
      where: { googleId: payload.sub },
      omit: SAFE_USER_OMIT,
      include: USER_INCLUDE_ORG,
    })
    if (!user) {
      const byEmail = await prisma.user.findUnique({
        where: { email: payload.email },
        omit: SAFE_USER_OMIT,
        include: USER_INCLUDE_ORG,
      })
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: payload.sub, name: byEmail.name ?? payload.name ?? null, role },
          omit: SAFE_USER_OMIT,
          include: USER_INCLUDE_ORG,
        })
      } else {
        user = await prisma.user.create({
          data: {
            googleId: payload.sub,
            email: payload.email,
            name: payload.name ?? null,
            role,
            termsAcceptedAt: new Date(),
          },
          omit: SAFE_USER_OMIT,
          include: USER_INCLUDE_ORG,
        })
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { email: payload.email, name: payload.name ?? null, role },
        omit: SAFE_USER_OMIT,
        include: USER_INCLUDE_ORG,
      })
    }

    if (user.suspendedAt) {
      res.status(403).json({ error: 'This account has been suspended. Contact your administrator.' })
      return
    }

    const token = signSession({ userId: user.id, role: user.role })
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS)
    res.json(user)
  } catch (error) {
    console.error('[auth] Google sign-in failed:', error)
    res.status(401).json({ error: 'Could not verify Google credential' })
  }
})

authRouter.post('/signup', async (req, res) => {
  const { email, password, name, termsAccepted, ageConfirmed } = req.body ?? {}

  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' })
    return
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    return
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required.' })
    return
  }
  if (termsAccepted !== true) {
    res.status(400).json({ error: 'You must accept the terms to create an account.' })
    return
  }
  if (ageConfirmed !== true) {
    res.status(400).json({ error: 'You must confirm you are at least 13 years old to create an account.' })
    return
  }

  const ip = req.ip ?? 'unknown'
  if (!checkLoginRateLimit(`signup:${ip}`)) {
    res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
    return
  }

  const normalizedEmail = email.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) {
    res.status(409).json({
      error: existing.passwordHash
        ? 'An account with this email already exists. Log in instead.'
        : 'This email is already registered with Google sign-in — log in with Google instead.',
    })
    return
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS)
  const role = ADMIN_EMAILS.has(normalizedEmail) ? 'superadmin' : 'teacher'

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role,
      termsAcceptedAt: new Date(),
      ageConfirmedAt: new Date(),
    },
    omit: SAFE_USER_OMIT,
    include: USER_INCLUDE_ORG,
  })

  const token = signSession({ userId: user.id, role: user.role })
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS)
  res.status(201).json(user)
})

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'email and password are required' })
    return
  }

  const ip = req.ip ?? 'unknown'
  if (!checkLoginRateLimit(`login:${ip}:${email.toLowerCase()}`)) {
    res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
    return
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, include: USER_INCLUDE_ORG })
  // Same generic message whether the account doesn't exist, has no password
  // (Google-only), or the password is wrong — never leak which case fired.
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: GENERIC_LOGIN_ERROR })
    return
  }
  if (user.suspendedAt) {
    res.status(403).json({ error: 'This account has been suspended. Contact your administrator.' })
    return
  }

  const token = signSession({ userId: user.id, role: user.role })
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS)
  const { passwordHash: _passwordHash, ...safeUser } = user
  res.json(safeUser)
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    omit: SAFE_USER_OMIT,
    include: USER_INCLUDE_ORG,
  })
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
