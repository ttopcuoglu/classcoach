import { createHash, randomBytes } from 'node:crypto'
import express, { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth, SESSION_COOKIE, signSession } from '../lib/auth.ts'
import {
  authRedirectUrl,
  CANVAS_ENVIRONMENTS,
  canvasConfig,
  getToolKey,
  isCanvasEnvironment,
  isStaff,
  LtiLaunchError,
  verifyLaunch,
} from '../lib/lti.ts'
import { normalizeCanvasUrl } from '../lib/canvasApi.ts'
import { prisma } from '../lib/prisma.ts'
import { seal } from '../lib/secretBox.ts'
import { COOKIE_OPTIONS } from './auth.ts'

// Wivoza inside Canvas (LTI 1.3). The protocol lives in lib/lti.ts; this file
// is the doors: the configuration and public key Canvas reads, the two-step
// sign-in a launch goes through, connecting a Canvas user to their Wivoza
// account once, and the admin side where a school adds its Canvas.
//
// Public, mounted before requireAuth: Canvas's browser redirects carry no
// Wivoza session. The routes that need one say so.

export const ltiRouter = Router()

/// The site the teacher lands on, which is also where the API is reached:
/// www.wivoza.com proxies /api to the API service, and the session cookie has
/// to be set on that same address for the web app to send it back.
const APP_URL = (process.env.APP_URL ?? 'https://www.wivoza.com').replace(/\/$/, '')
const LAUNCH_URL = `${APP_URL}/api/lti/launch`
const JWT_SECRET = process.env.JWT_SECRET ?? ''
const STATE_TTL_SECONDS = 10 * 60
const PENDING_TTL_MS = 30 * 60 * 1000

const form = express.urlencoded({ extended: false })

// ---------------------------------------------------------------------------
// What Canvas reads
// ---------------------------------------------------------------------------

ltiRouter.get('/config.json', (_req, res) => {
  res.json(canvasConfig(APP_URL))
})

ltiRouter.get('/jwks', (_req, res) => {
  res.json({ keys: [getToolKey().publicJwk] })
})

// ---------------------------------------------------------------------------
// Pages a launch can end on
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/// A launch that cannot go on ends on a page of its own: the browser is a
/// top-level tab Canvas opened, with no Wivoza app around it to show a message.
function sendPage(res: Response, status: number, title: string, body: string) {
  res
    .status(status)
    .type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Wivoza</title>
<style>
body{margin:0;background:#f7f3ea;color:#1b2e28;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
main{max-width:460px;background:#fff;border:1px solid #e7e1d6;border-radius:18px;padding:28px}
h1{font-size:22px;margin:0 0 10px}p{margin:0 0 10px;color:#4a5550}.brand{font-weight:800;letter-spacing:.02em;color:#2f6f66;margin-bottom:14px}
code{background:#eef4f2;padding:1px 6px;border-radius:5px;overflow-wrap:anywhere}
</style></head><body><main><div class="brand">Wivoza</div><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`)
}

const stateCookie = (state: string) => `lti_state_${state}`
const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  // Canvas posts the launch back cross-site, so the cookie that proves this
  // browser started it must be sent on a cross-site POST.
  secure: true,
  sameSite: 'none' as const,
  path: '/api/lti',
  maxAge: STATE_TTL_SECONDS * 1000,
}

// ---------------------------------------------------------------------------
// Step one: Canvas sends the browser here; we send it on to Canvas's sign-in
// ---------------------------------------------------------------------------

async function handleLogin(req: Request, res: Response) {
  const params = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const iss = str(params.iss)
  const clientId = str(params.client_id)
  const loginHint = str(params.login_hint)
  if (!iss || !loginHint) {
    sendPage(res, 400, 'Open Wivoza from Canvas', '<p>This address is the start of Wivoza\'s sign-in from Canvas. Use the Wivoza link in your course instead.</p>')
    return
  }

  const platform = clientId ? await prisma.ltiPlatform.findFirst({ where: { issuer: iss, clientId, archivedAt: null } }) : null
  if (!platform) {
    sendPage(
      res,
      404,
      "This Canvas isn't connected yet",
      `<p>Your school's Canvas has Wivoza installed, but Wivoza doesn't know this install yet.</p><p>Your school's Wivoza admin can add it under Admin → Canvas, using the client ID${clientId ? ` <code>${escapeHtml(clientId)}</code>` : ''}.</p>`,
    )
    return
  }

  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  res.cookie(stateCookie(state), jwt.sign({ purpose: 'lti-state', nonce, platformId: platform.id }, JWT_SECRET, { expiresIn: STATE_TTL_SECONDS }), STATE_COOKIE_OPTIONS)
  res.redirect(
    302,
    authRedirectUrl(platform, { redirectUri: LAUNCH_URL, loginHint, messageHint: str(params.lti_message_hint), state, nonce }),
  )
}

ltiRouter.get('/login', handleLogin)
ltiRouter.post('/login', form, handleLogin)

// ---------------------------------------------------------------------------
// Step two: Canvas posts the signed launch back
// ---------------------------------------------------------------------------

ltiRouter.post('/launch', form, async (req, res) => {
  const { id_token: idToken, state } = (req.body ?? {}) as Record<string, unknown>
  if (typeof idToken !== 'string' || typeof state !== 'string') {
    sendPage(res, 400, 'Open Wivoza from Canvas', '<p>Use the Wivoza link in your Canvas course.</p>')
    return
  }

  // The state cookie proves this browser started the sign-in, and carries
  // the nonce the token has to repeat. One use only.
  const cookie = req.cookies?.[stateCookie(state)]
  res.clearCookie(stateCookie(state), { ...STATE_COOKIE_OPTIONS, maxAge: undefined })
  let started: { nonce: string; platformId: string } | null = null
  try {
    const payload = jwt.verify(String(cookie ?? ''), JWT_SECRET) as { purpose?: string; nonce: string; platformId: string }
    if (payload.purpose === 'lti-state') started = payload
  } catch {
    started = null
  }
  if (!started) {
    sendPage(
      res,
      400,
      'That took too long',
      "<p>The sign-in from Canvas expired or was opened in a different browser. Go back to Canvas and click Wivoza again.</p><p>If it keeps happening, check that your browser isn't blocking cookies for wivoza.com.</p>",
    )
    return
  }

  const platform = await prisma.ltiPlatform.findFirst({ where: { id: started.platformId, archivedAt: null } })
  if (!platform) {
    sendPage(res, 404, "This Canvas isn't connected any more", "<p>Your school's Wivoza admin has removed this Canvas install.</p>")
    return
  }

  let claims
  try {
    claims = await verifyLaunch(idToken, platform, started.nonce)
  } catch (error) {
    const message = error instanceof LtiLaunchError ? error.message : 'The launch could not be checked.'
    console.warn('[lti] launch refused:', platform.id, message)
    sendPage(res, 400, "Wivoza couldn't open", `<p>${escapeHtml(message)}</p><p>Go back to Canvas and try again.</p>`)
    return
  }

  // Course navigation is already hidden from students; this is the check that
  // does not depend on how a Canvas admin set it up.
  if (!isStaff(claims.roles)) {
    sendPage(res, 403, 'Wivoza is for teachers', '<p>Wivoza is a coaching tool for teachers, so there is nothing here for a student account.</p>')
    return
  }

  const link = await prisma.ltiUserLink.findUnique({
    where: { platformId_sub: { platformId: platform.id, sub: claims.sub } },
    include: { user: { select: { id: true, role: true, suspendedAt: true } } },
  })
  if (link) {
    if (link.user.suspendedAt) {
      sendPage(res, 403, 'This account is suspended', '<p>Contact your school\'s Wivoza admin.</p>')
      return
    }
    await prisma.ltiUserLink.update({ where: { id: link.id }, data: { lastLaunchAt: new Date() } })
    res.cookie(SESSION_COOKIE, signSession({ userId: link.user.id, role: link.user.role }), COOKIE_OPTIONS)
    res.redirect(303, `${APP_URL}/`)
    return
  }

  // Not connected yet: the teacher confirms which Wivoza account this is,
  // signed in to it, once. The token in the address is single-use and short.
  const token = randomBytes(32).toString('base64url')
  await prisma.ltiPendingLink.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  await prisma.ltiPendingLink.create({
    data: {
      tokenHash: hashToken(token),
      platformId: platform.id,
      sub: claims.sub,
      name: claims.name,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS),
    },
  })
  res.redirect(303, `${APP_URL}/lti/connect?token=${token}`)
})

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ---------------------------------------------------------------------------
// Connecting a Canvas user to a Wivoza account, once
// ---------------------------------------------------------------------------

async function pendingFor(token: unknown) {
  if (typeof token !== 'string' || !token) return null
  const pending = await prisma.ltiPendingLink.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { platform: { include: { organization: { select: { name: true } } } } },
  })
  if (!pending || pending.expiresAt < new Date() || pending.platform.archivedAt) return null
  return pending
}

ltiRouter.get('/pending', requireAuth, async (req, res) => {
  const pending = await pendingFor(req.query.token)
  if (!pending) {
    res.status(404).json({ error: 'This link from Canvas has expired. Go back to Canvas and click Wivoza again.' })
    return
  }
  res.json({ canvasName: pending.platform.name, schoolName: pending.platform.organization.name, nameInCanvas: pending.name })
})

ltiRouter.post('/connect', requireAuth, async (req, res) => {
  const pending = await pendingFor(req.body?.token)
  if (!pending) {
    res.status(404).json({ error: 'This link from Canvas has expired. Go back to Canvas and click Wivoza again.' })
    return
  }
  const userId = req.user!.userId
  const existing = await prisma.ltiUserLink.findUnique({ where: { platformId_sub: { platformId: pending.platformId, sub: pending.sub } } })
  if (existing && existing.userId !== userId) {
    res.status(409).json({ error: 'That Canvas account is already connected to a different Wivoza account.' })
    return
  }
  if (!existing) {
    await prisma.ltiUserLink.create({ data: { platformId: pending.platformId, sub: pending.sub, userId, lastLaunchAt: new Date() } })
  }
  await prisma.ltiPendingLink.delete({ where: { tokenHash: pending.tokenHash } })
  res.json({ ok: true, canvasName: pending.platform.name })
})

// ---------------------------------------------------------------------------
// A school adding its Canvas (org admins)
// ---------------------------------------------------------------------------

async function schoolAdmin(req: Request, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, role: true, organizationId: true },
  })
  if (!user?.organizationId || (user.role !== 'org_admin' && user.role !== 'superadmin')) {
    res.status(403).json({ error: "Only your school's Wivoza admins can connect Canvas." })
    return null
  }
  return { id: user.id, organizationId: user.organizationId }
}

ltiRouter.get('/platforms', requireAuth, async (req, res) => {
  const admin = await schoolAdmin(req, res)
  if (!admin) return
  const platforms = await prisma.ltiPlatform.findMany({
    where: { organizationId: admin.organizationId, archivedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      environment: true,
      clientId: true,
      createdAt: true,
      canvasUrl: true,
      apiClientId: true,
      apiClientSecretEnc: true,
      _count: { select: { links: true, canvasTokens: true } },
    },
  })
  res.json({
    configUrl: `${APP_URL}/api/lti/config.json`,
    oauthRedirectUri: `${APP_URL}/api/canvas/oauth/callback`,
    // The secret itself never leaves the server; the page only learns whether one is set.
    platforms: platforms.map(({ _count, apiClientSecretEnc, ...p }) => ({
      ...p,
      sendReady: !!(p.canvasUrl && p.apiClientId && apiClientSecretEnc),
      connectedTeachers: _count.links,
      sendingTeachers: _count.canvasTokens,
    })),
  })
})

ltiRouter.post('/platforms', requireAuth, async (req, res) => {
  const admin = await schoolAdmin(req, res)
  if (!admin) return
  const { environment, clientId, name } = req.body ?? {}
  const env = environment ?? 'production'
  const cleanClientId = typeof clientId === 'string' ? clientId.trim() : ''
  if (!isCanvasEnvironment(env) || !/^\d{4,30}$/.test(cleanClientId)) {
    res.status(400).json({ error: "Enter the developer key's client ID — the long number Canvas shows under Details." })
    return
  }
  const cleanName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Canvas'
  const { issuer, authUrl, jwksUrl } = CANVAS_ENVIRONMENTS[env]

  const existing = await prisma.ltiPlatform.findUnique({ where: { issuer_clientId: { issuer, clientId: cleanClientId } } })
  if (existing && existing.organizationId !== admin.organizationId) {
    res.status(409).json({ error: 'That Canvas key is already connected to a different school.' })
    return
  }
  if (existing && !existing.archivedAt) {
    res.status(409).json({ error: 'That Canvas key is already connected.' })
    return
  }
  // Re-adding a key that was removed brings back its teachers' connections.
  const platform = existing
    ? await prisma.ltiPlatform.update({ where: { id: existing.id }, data: { archivedAt: null, name: cleanName } })
    : await prisma.ltiPlatform.create({
        data: { organizationId: admin.organizationId, name: cleanName, environment: env, issuer, clientId: cleanClientId, authUrl, jwksUrl, createdByUserId: admin.id },
      })
  res.status(201).json({ id: platform.id, name: platform.name, environment: platform.environment, clientId: platform.clientId, createdAt: platform.createdAt, connectedTeachers: 0 })
})

/// Send to Canvas's half of the set-up: the school's Canvas address and its
/// API developer key. The secret can be left out to keep the one already set.
ltiRouter.patch('/platforms/:id', requireAuth, async (req, res) => {
  const admin = await schoolAdmin(req, res)
  if (!admin) return
  const platform = await prisma.ltiPlatform.findFirst({ where: { id: String(req.params.id), organizationId: admin.organizationId, archivedAt: null } })
  if (!platform) {
    res.status(404).json({ error: 'Canvas install not found' })
    return
  }
  const { canvasUrl, apiClientId, apiClientSecret } = req.body ?? {}
  const url = normalizeCanvasUrl(canvasUrl)
  const clientId = typeof apiClientId === 'string' ? apiClientId.trim() : ''
  const secret = typeof apiClientSecret === 'string' ? apiClientSecret.trim() : ''
  if (!url) {
    res.status(400).json({ error: "Enter your school's Canvas address, like yourschool.instructure.com." })
    return
  }
  if (!/^\d{4,30}$/.test(clientId)) {
    res.status(400).json({ error: "Enter the API key's client ID — the long number Canvas shows under Details." })
    return
  }
  if (!secret && !platform.apiClientSecretEnc) {
    res.status(400).json({ error: "Enter the API key's secret — Canvas shows it when you click Show Key." })
    return
  }
  const changedKey = clientId !== platform.apiClientId || url !== platform.canvasUrl
  await prisma.$transaction([
    prisma.ltiPlatform.update({
      where: { id: platform.id },
      data: { canvasUrl: url, apiClientId: clientId, ...(secret ? { apiClientSecretEnc: seal(secret) } : {}) },
    }),
    // Teachers' permissions were given to the old key or Canvas; they no
    // longer work, so they go and each teacher is asked once more.
    ...(changedKey ? [prisma.canvasToken.deleteMany({ where: { platformId: platform.id } })] : []),
  ])
  res.json({ ok: true })
})

ltiRouter.delete('/platforms/:id', requireAuth, async (req, res) => {
  const admin = await schoolAdmin(req, res)
  if (!admin) return
  const { count } = await prisma.ltiPlatform.updateMany({
    where: { id: String(req.params.id), organizationId: admin.organizationId, archivedAt: null },
    data: { archivedAt: new Date() },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Canvas install not found' })
    return
  }
  res.status(204).end()
})
