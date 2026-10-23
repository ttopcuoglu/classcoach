import { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { requireAuth, SESSION_COOKIE, verifySession } from '../lib/auth.ts'
import {
  addPageToModule,
  authorizeUrl,
  CanvasApiError,
  createPage,
  exchangeCode,
  listModules,
  listTeachingCourses,
  refreshAccess,
  type CanvasApp,
} from '../lib/canvasApi.ts'
import { lessonHtml } from '../lib/lessonHtml.ts'
import { prisma } from '../lib/prisma.ts'
import { open, seal } from '../lib/secretBox.ts'

// Send to Canvas: a lesson or a week from Planning Coach, as a page in one of
// the teacher's Canvas courses. Uses Canvas's REST API with the teacher's
// own permission (OAuth, given once in a Canvas pop-up), never the school's
// LTI connection, which cannot create pages.
//
// Everything here needs a Wivoza session. The OAuth callback reads it itself
// because it is a page in a pop-up, not a fetch.

export const canvasRouter = Router()

// Every route needs a session except the pop-up's callback, which reads it
// itself so a missing one gets a page rather than a JSON 401.
canvasRouter.use((req, res, next) => (req.path === '/oauth/callback' ? next() : requireAuth(req, res, next)))

const APP_URL = (process.env.APP_URL ?? 'https://www.wivoza.com').replace(/\/$/, '')
const REDIRECT_URI = `${APP_URL}/api/canvas/oauth/callback`
const JWT_SECRET = process.env.JWT_SECRET ?? ''

type Platform = NonNullable<Awaited<ReturnType<typeof prisma.ltiPlatform.findFirst>>>

/// The school Canvas this teacher can send to: one their Canvas account is
/// connected to, or their school's. Only one with an API key set up counts.
async function sendablePlatform(userId: string): Promise<{ platform: Platform; app: CanvasApp } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  const platform = await prisma.ltiPlatform.findFirst({
    where: {
      archivedAt: null,
      canvasUrl: { not: null },
      apiClientId: { not: null },
      apiClientSecretEnc: { not: null },
      OR: [{ links: { some: { userId } } }, ...(user?.organizationId ? [{ organizationId: user.organizationId }] : [])],
    },
    orderBy: { createdAt: 'asc' },
  })
  const secret = platform?.apiClientSecretEnc ? open(platform.apiClientSecretEnc) : null
  if (!platform || !secret) return null
  return { platform, app: { canvasUrl: platform.canvasUrl!, clientId: platform.apiClientId!, clientSecret: secret, redirectUri: REDIRECT_URI } }
}

/// A working access token, refreshed when it is about to run out. Null means
/// the teacher has to give permission (again): none yet, or Canvas no longer
/// honours the one they gave.
async function accessToken(userId: string, platform: Platform, app: CanvasApp): Promise<string | null> {
  const row = await prisma.canvasToken.findUnique({ where: { userId_platformId: { userId, platformId: platform.id } } })
  if (!row) return null
  const current = open(row.accessTokenEnc)
  if (current && row.expiresAt.getTime() - Date.now() > 60_000) return current
  const refresh = row.refreshTokenEnc ? open(row.refreshTokenEnc) : null
  if (!refresh) {
    await prisma.canvasToken.delete({ where: { id: row.id } })
    return null
  }
  try {
    const grant = await refreshAccess(app, refresh)
    await prisma.canvasToken.update({
      where: { id: row.id },
      data: { accessTokenEnc: seal(grant.accessToken), expiresAt: grant.expiresAt },
    })
    return grant.accessToken
  } catch (error) {
    if (error instanceof CanvasApiError && error.status >= 400 && error.status < 500) {
      await prisma.canvasToken.delete({ where: { id: row.id } })
      return null
    }
    throw error
  }
}

const RECONNECT = { error: 'Wivoza needs your permission in Canvas first.', reconnect: true }

/// Runs a Canvas call with the teacher's token, turning the failures a
/// teacher can act on into answers the dialog understands.
async function withCanvas(req: Request, res: Response, fn: (canvasUrl: string, token: string) => Promise<unknown>) {
  const userId = req.user!.userId
  const found = await sendablePlatform(userId)
  if (!found) {
    res.status(404).json({ error: "Your school hasn't set up sending to Canvas yet." })
    return
  }
  try {
    const token = await accessToken(userId, found.platform, found.app)
    if (!token) {
      res.status(409).json(RECONNECT)
      return
    }
    res.json(await fn(found.app.canvasUrl, token))
  } catch (error) {
    if (error instanceof CanvasApiError) {
      if (error.status === 401) {
        await prisma.canvasToken.deleteMany({ where: { userId, platformId: found.platform.id } })
        res.status(409).json(RECONNECT)
        return
      }
      console.warn('[canvas] call refused:', error.status, error.message)
      res.status(error.status === 403 ? 403 : 502).json({
        error: error.status === 403 ? "Canvas didn't allow that for this course." : `Canvas said: ${error.message}`,
      })
      return
    }
    console.error('[canvas] call failed:', error)
    res.status(502).json({ error: "Couldn't reach Canvas. Please try again." })
  }
}

// ---------------------------------------------------------------------------

canvasRouter.get('/status', async (req, res) => {
  const found = await sendablePlatform(req.user!.userId)
  if (!found) {
    res.json({ available: false, connected: false, canvasName: null })
    return
  }
  const token = await prisma.canvasToken.findUnique({
    where: { userId_platformId: { userId: req.user!.userId, platformId: found.platform.id } },
    select: { id: true },
  })
  res.json({ available: true, connected: !!token, canvasName: found.platform.name })
})

/// Opened in a pop-up: on to Canvas's consent screen.
canvasRouter.get('/oauth/start', async (req, res) => {
  const found = await sendablePlatform(req.user!.userId)
  if (!found) {
    res.status(404).type('text').send("Your school hasn't set up sending to Canvas yet.")
    return
  }
  const state = jwt.sign({ purpose: 'canvas-oauth', userId: req.user!.userId, platformId: found.platform.id }, JWT_SECRET, { expiresIn: 600 })
  res.redirect(302, authorizeUrl(found.app, state))
})

/// The pop-up's last page: tells the Wivoza tab that opened it how it went,
/// then closes.
function popupResult(res: Response, ok: boolean, message: string) {
  const payload = JSON.stringify({ type: 'wivoza-canvas', ok, message }).replace(/</g, '\\u003c')
  const text = message.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Wivoza</title>
<body style="font:16px system-ui,sans-serif;background:#f7f3ea;color:#1b2e28;display:grid;place-items:center;min-height:100vh;margin:0">
<p style="max-width:360px;text-align:center">${text}</p>
<script>try{window.opener&&window.opener.postMessage(${payload},${JSON.stringify(APP_URL)})}catch(e){}setTimeout(function(){window.close()},${ok ? 600 : 4000})</script></body>`)
}

canvasRouter.get('/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>
  const session = verifySession(String(req.cookies?.[SESSION_COOKIE] ?? ''))
  let started: { userId: string; platformId: string } | null = null
  try {
    const payload = jwt.verify(String(state ?? ''), JWT_SECRET) as { purpose?: string; userId: string; platformId: string }
    if (payload.purpose === 'canvas-oauth') started = payload
  } catch {
    started = null
  }
  if (!session || !started || started.userId !== session.userId) {
    popupResult(res, false, 'That took too long, or you were signed out of Wivoza. Close this window and try Send to Canvas again.')
    return
  }
  if (error || !code) {
    popupResult(res, false, error === 'access_denied' ? 'You chose not to allow Wivoza in Canvas. Nothing was sent.' : 'Canvas did not give permission. Nothing was sent.')
    return
  }
  const found = await sendablePlatform(session.userId)
  if (!found || found.platform.id !== started.platformId) {
    popupResult(res, false, "Your school's Canvas set-up changed. Close this window and try again.")
    return
  }
  try {
    const grant = await exchangeCode(found.app, code)
    const data = {
      canvasUserId: grant.canvasUserId,
      accessTokenEnc: seal(grant.accessToken),
      refreshTokenEnc: grant.refreshToken ? seal(grant.refreshToken) : null,
      expiresAt: grant.expiresAt,
    }
    await prisma.canvasToken.upsert({
      where: { userId_platformId: { userId: session.userId, platformId: found.platform.id } },
      create: { userId: session.userId, platformId: found.platform.id, ...data },
      update: data,
    })
    popupResult(res, true, 'Canvas is connected. You can close this window.')
  } catch (err) {
    console.warn('[canvas] code exchange failed:', err)
    popupResult(res, false, "Canvas didn't accept Wivoza's sign-in. Ask your school's Wivoza admin to check the Canvas API key.")
  }
})

canvasRouter.get('/courses', (req, res) => withCanvas(req, res, (url, token) => listTeachingCourses(url, token)))

canvasRouter.get('/courses/:courseId/modules', (req, res) =>
  withCanvas(req, res, (url, token) => listModules(url, token, String(req.params.courseId))),
)

canvasRouter.post('/send', async (req, res) => {
  const { planId, courseId, moduleId, title, published, useFormat } = req.body ?? {}
  if (typeof planId !== 'string' || typeof courseId !== 'string' || !/^\d+$/.test(courseId)) {
    res.status(400).json({ error: 'Pick a course to send it to.' })
    return
  }
  if (moduleId != null && (typeof moduleId !== 'string' || !/^\d+$/.test(moduleId))) {
    res.status(400).json({ error: 'That module is not valid.' })
    return
  }
  const plan = await prisma.lessonPlan.findFirst({ where: { id: planId, userId: req.user!.userId } })
  if (!plan) {
    res.status(404).json({ error: 'Lesson plan not found' })
    return
  }
  const html = lessonHtml(plan, useFormat !== false)
  if (!html.trim()) {
    res.status(400).json({ error: 'This plan has nothing to send yet.' })
    return
  }
  const pageTitle = (typeof title === 'string' && title.trim() ? title.trim() : plan.objective?.trim() || 'Lesson plan').slice(0, 250)

  await withCanvas(req, res, async (url, token) => {
    const page = await createPage(url, token, courseId, { title: pageTitle, html, published: published === true })
    let addedToModule = false
    if (moduleId) {
      try {
        await addPageToModule(url, token, courseId, moduleId, { title: pageTitle, url: page.url })
        addedToModule = true
      } catch (error) {
        // The page exists either way; say the module part didn't happen
        // rather than reporting the whole send as failed.
        console.warn('[canvas] adding to module failed:', error)
      }
    }
    return { pageUrl: page.htmlUrl, addedToModule, published: published === true }
  })
})

canvasRouter.delete('/connection', async (req, res) => {
  await prisma.canvasToken.deleteMany({ where: { userId: req.user!.userId } })
  res.status(204).end()
})
