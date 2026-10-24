import { createHash, randomBytes } from 'node:crypto'
import express, { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth, SESSION_COOKIE, signSession } from '../lib/auth.ts'
import {
  authRedirectUrl,
  CANVAS_ENVIRONMENTS,
  canvasConfig,
  choosePlatform,
  cleanClientId,
  cleanDeploymentId,
  cleanHttpsUrl,
  cleanIssuer,
  getToolKey,
  isCanvasEnvironment,
  isLmsKind,
  isStaff,
  LMS_LABEL,
  LtiLaunchError,
  vendorApp,
  verifyLaunch,
  type LmsKind,
} from '../lib/lti.ts'
import { normalizeCanvasUrl } from '../lib/canvasApi.ts'
import { prisma } from '../lib/prisma.ts'
import { seal } from '../lib/secretBox.ts'
import { COOKIE_OPTIONS } from './auth.ts'

// Wivoza inside a school's LMS (LTI 1.3): Canvas, Schoology, Brightspace,
// Moodle and Blackboard. The protocol lives in lib/lti.ts; this file is the
// doors: the configuration and public key an LMS reads, the two-step sign-in
// a launch goes through, connecting an LMS user to their Wivoza account once,
// and the admin side where a school adds its LMS.
//
// Public, mounted before requireAuth: the LMS's browser redirects carry no
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

const lmsName = (lms: string | undefined) => (lms && isLmsKind(lms) ? LMS_LABEL[lms] : 'LMS')

function notConnectedPage(res: Response, lms: string | undefined, detail: { clientId?: string | null; deploymentId?: string | null }) {
  const name = lmsName(lms)
  const ids = [
    detail.clientId && `the client ID <code>${escapeHtml(detail.clientId)}</code>`,
    detail.deploymentId && `the deployment ID <code>${escapeHtml(detail.deploymentId)}</code>`,
  ].filter(Boolean)
  sendPage(
    res,
    404,
    `This ${name} isn't connected yet`,
    `<p>Your school's ${name} has Wivoza installed, but Wivoza doesn't know this install yet.</p><p>Your school's Wivoza admin can add it under Admin → LMS${ids.length ? `, using ${ids.join(' and ')}` : ''}.</p>`,
  )
}

/// The installs a launch could belong to. Most LMSs send their client id at
/// step one; Blackboard does not, so an issuer alone is enough when every
/// install under it shares one client id (Wivoza's own app there).
async function candidatesFor(issuer: string, clientId: string | null) {
  const rows = await prisma.ltiPlatform.findMany({ where: { issuer, archivedAt: null, ...(clientId ? { clientId } : {}) } })
  const clientIds = new Set(rows.map((r) => r.clientId))
  return clientIds.size > 1 ? [] : rows
}

async function handleLogin(req: Request, res: Response) {
  const params = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown>) ?? {}) }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const iss = str(params.iss)
  const clientId = str(params.client_id)
  const deploymentId = str(params.lti_deployment_id) ?? str(params.deployment_id)
  const loginHint = str(params.login_hint)
  if (!iss || !loginHint) {
    sendPage(res, 400, 'Open Wivoza from your LMS', "<p>This address is the start of Wivoza's sign-in from your school's LMS. Use the Wivoza link in your course instead.</p>")
    return
  }

  const candidates = await candidatesFor(iss, clientId)
  // When step one names the install, an install Wivoza doesn't know is said
  // so now; otherwise the launch itself carries it and step two decides.
  if (!candidates.length || (deploymentId && !choosePlatform(candidates, deploymentId))) {
    notConnectedPage(res, candidates[0]?.lms, { clientId, deploymentId })
    return
  }
  const platform = candidates[0]

  const state = randomBytes(24).toString('base64url')
  const nonce = randomBytes(24).toString('base64url')
  res.cookie(
    stateCookie(state),
    jwt.sign({ purpose: 'lti-state', nonce, issuer: platform.issuer, clientId: platform.clientId }, JWT_SECRET, { expiresIn: STATE_TTL_SECONDS }),
    STATE_COOKIE_OPTIONS,
  )
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
    sendPage(res, 400, 'Open Wivoza from your LMS', '<p>Use the Wivoza link in your course.</p>')
    return
  }

  // The state cookie proves this browser started the sign-in, and carries
  // the nonce the token has to repeat. One use only.
  const cookie = req.cookies?.[stateCookie(state)]
  res.clearCookie(stateCookie(state), { ...STATE_COOKIE_OPTIONS, maxAge: undefined })
  let started: { nonce: string; issuer: string; clientId: string } | null = null
  try {
    const payload = jwt.verify(String(cookie ?? ''), JWT_SECRET) as { purpose?: string; nonce: string; issuer?: string; clientId?: string }
    if (payload.purpose === 'lti-state' && payload.issuer && payload.clientId) started = { nonce: payload.nonce, issuer: payload.issuer, clientId: payload.clientId }
  } catch {
    started = null
  }
  if (!started) {
    sendPage(
      res,
      400,
      'That took too long',
      "<p>The sign-in from your LMS expired or was opened in a different browser. Go back to your course and click Wivoza again.</p><p>If it keeps happening, check that your browser isn't blocking cookies for wivoza.com.</p>",
    )
    return
  }

  const candidates = await candidatesFor(started.issuer, started.clientId)
  if (!candidates.length) {
    sendPage(res, 404, "This LMS isn't connected any more", "<p>Your school's Wivoza admin has removed this install.</p>")
    return
  }

  // Every install under one issuer and client id shares its signing keys,
  // so any of them checks the token; the token's deployment then says whose
  // launch it is.
  let claims
  try {
    claims = await verifyLaunch(idToken, candidates[0], started.nonce)
  } catch (error) {
    const message = error instanceof LtiLaunchError ? error.message : 'The launch could not be checked.'
    console.warn('[lti] launch refused:', started.issuer, message)
    sendPage(res, 400, "Wivoza couldn't open", `<p>${escapeHtml(message)}</p><p>Go back to your course and try again.</p>`)
    return
  }
  const platform = choosePlatform(candidates, claims.deploymentId)
  if (!platform) {
    notConnectedPage(res, candidates[0].lms, { clientId: started.clientId, deploymentId: claims.deploymentId })
    return
  }

  // Where the LMS can hide the link from students it does; this is the check
  // that does not depend on how an LMS admin set it up.
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
  res.json({
    canvasName: pending.platform.name,
    lmsName: lmsName(pending.platform.lms),
    schoolName: pending.platform.organization.name,
    nameInCanvas: pending.name,
  })
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
      lms: true,
      environment: true,
      clientId: true,
      deploymentId: true,
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
    // What an LMS admin types into their LMS when it has no configuration URL.
    toolUrls: { login: `${APP_URL}/api/lti/login`, launch: LAUNCH_URL, jwks: `${APP_URL}/api/lti/jwks`, domain: new URL(APP_URL).host },
    // Wivoza's own app in Schoology and Blackboard; null until it is registered.
    vendorApps: { schoology: vendorApp('schoology')?.clientId ?? null, blackboard: vendorApp('blackboard')?.clientId ?? null },
    // The secret itself never leaves the server; the page only learns whether one is set.
    platforms: platforms.map(({ _count, apiClientSecretEnc, ...p }) => ({
      ...p,
      sendReady: !!(p.canvasUrl && p.apiClientId && apiClientSecretEnc),
      connectedTeachers: _count.links,
      sendingTeachers: _count.canvasTokens,
    })),
  })
})

type Registration = { lms: LmsKind; environment: string; issuer: string; clientId: string; authUrl: string; jwksUrl: string; deploymentId: string | null }

/// What the admin entered, as an install — or the sentence that says what is
/// missing. Each LMS asks for only what it cannot be known without the admin.
function readRegistration(body: Record<string, unknown>): Registration | { error: string; status?: number } {
  const lms = body.lms ?? 'canvas'
  if (!isLmsKind(lms)) return { error: 'Pick your LMS.' }
  const deploymentId = body.deploymentId == null || body.deploymentId === '' ? null : cleanDeploymentId(body.deploymentId)
  if (body.deploymentId && !deploymentId) return { error: 'That deployment ID has characters an LMS would not use. Paste it again.' }

  if (lms === 'canvas') {
    const env = body.environment ?? 'production'
    const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
    if (!isCanvasEnvironment(env) || !/^\d{4,30}$/.test(clientId)) {
      return { error: "Enter the developer key's client ID — the long number Canvas shows under Details." }
    }
    return { lms, environment: env, ...CANVAS_ENVIRONMENTS[env], clientId, deploymentId }
  }

  if (lms === 'schoology' || lms === 'blackboard') {
    const app = vendorApp(lms)
    if (!app) return { error: `Wivoza's ${LMS_LABEL[lms]} app isn't available yet. Contact Wivoza to set it up for your school.`, status: 409 }
    if (!deploymentId) return { error: `Enter the deployment ID ${LMS_LABEL[lms]} shows for your Wivoza install.` }
    return { lms, environment: lms, ...app, deploymentId }
  }

  // Brightspace and Moodle: each school's own registration, so its own
  // issuer and endpoints, copied from the LMS's registration details.
  const clientId = cleanClientId(body.clientId)
  const issuer = cleanIssuer(body.issuer)
  const authUrl = cleanHttpsUrl(body.authUrl)
  const jwksUrl = cleanHttpsUrl(body.jwksUrl)
  if (!clientId) return { error: 'Enter the client ID your LMS shows for Wivoza.' }
  if (!issuer) return { error: lms === 'moodle' ? "Enter Moodle's Platform ID — it starts with https://." : "Enter Brightspace's Issuer — it starts with https://." }
  if (!authUrl) return { error: lms === 'moodle' ? 'Enter the Authentication request URL from Moodle.' : 'Enter the OpenID Connect Authentication Endpoint from Brightspace.' }
  if (!jwksUrl) return { error: lms === 'moodle' ? 'Enter the Public keyset URL from Moodle.' : 'Enter the Brightspace Keyset URL.' }
  return { lms, environment: lms, issuer, clientId, authUrl, jwksUrl, deploymentId }
}

ltiRouter.post('/platforms', requireAuth, async (req, res) => {
  const admin = await schoolAdmin(req, res)
  if (!admin) return
  const reg = readRegistration((req.body ?? {}) as Record<string, unknown>)
  if ('error' in reg) {
    res.status(reg.status ?? 400).json({ error: reg.error })
    return
  }
  const cleanName = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 80) : LMS_LABEL[reg.lms]

  // Two installs clash when a launch could belong to either: the same issuer
  // and client id, and the same deployment or one that takes any deployment.
  const sameKey = await prisma.ltiPlatform.findMany({ where: { issuer: reg.issuer, clientId: reg.clientId } })
  const clashes = sameKey.filter((p) => !reg.deploymentId || !p.deploymentId || p.deploymentId === reg.deploymentId)
  const elsewhere = clashes.find((p) => p.organizationId !== admin.organizationId && !p.archivedAt)
  if (elsewhere) {
    res.status(409).json({ error: `That ${LMS_LABEL[reg.lms]} install is already connected to a different school.` })
    return
  }
  if (clashes.some((p) => p.organizationId === admin.organizationId && !p.archivedAt)) {
    res.status(409).json({ error: `That ${LMS_LABEL[reg.lms]} install is already connected.` })
    return
  }
  // Re-adding an install that was removed brings back its teachers' connections.
  const removed = clashes.find((p) => p.organizationId === admin.organizationId && p.archivedAt && p.deploymentId === reg.deploymentId)
  const platform = removed
    ? await prisma.ltiPlatform.update({ where: { id: removed.id }, data: { archivedAt: null, name: cleanName } })
    : await prisma.ltiPlatform.create({
        data: {
          organizationId: admin.organizationId,
          name: cleanName,
          lms: reg.lms,
          environment: reg.environment,
          issuer: reg.issuer,
          clientId: reg.clientId,
          authUrl: reg.authUrl,
          jwksUrl: reg.jwksUrl,
          deploymentId: reg.deploymentId,
          createdByUserId: admin.id,
        },
      })
  res.status(201).json({
    id: platform.id,
    name: platform.name,
    lms: platform.lms,
    environment: platform.environment,
    clientId: platform.clientId,
    deploymentId: platform.deploymentId,
    createdAt: platform.createdAt,
    connectedTeachers: 0,
  })
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
  if (platform.lms !== 'canvas') {
    res.status(400).json({ error: 'Sending lessons is only for Canvas.' })
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
