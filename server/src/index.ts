import { readFileSync } from 'node:fs'
import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { adminRouter } from './routes/admin.ts'
import { assignmentCoachRouter } from './routes/assignmentCoach.ts'
import { attemptsRouter } from './routes/attempts.ts'
import { audioSessionsRouter, failOrphanedAnalyses, failOrphanedTranscriptions } from './routes/audioSessions.ts'
import { authRouter } from './routes/auth.ts'
import { billingRouter } from './routes/billing.ts'
import { billingWebhookRouter } from './routes/billingWebhook.ts'
import { conversationPlanRouter } from './routes/conversationPlan.ts'
import { conversationPrepRouter } from './routes/conversationPrep.ts'
import { debriefRouter } from './routes/debrief.ts'
import { followUpsRouter } from './routes/followUps.ts'
import { lessonPlansRouter } from './routes/lessonPlans.ts'
import { onboardingRouter } from './routes/onboarding.ts'
import { parentMessageRouter } from './routes/parentMessage.ts'
import { profileRouter } from './routes/profile.ts'
import { scenariosRouter } from './routes/scenarios.ts'
import { shareRouter } from './routes/share.ts'
import { ttsRouter } from './routes/tts.ts'
import { supportRouter } from './routes/support.ts'
import { telegramRouter, telegramWebhookRouter } from './routes/telegram.ts'
import { schoolInquiriesRouter } from './routes/schoolInquiries.ts'
import { requireAuth } from './lib/auth.ts'
import { keepConnectionsWarm } from './lib/httpPool.ts'
import { startRetentionSweeps } from './lib/retention.ts'
import { startTelegramBot } from './lib/telegramCoach.ts'
import { attachLiveSttServer } from './routes/sttLive.ts'

// Must run before anything makes a request: it replaces the dispatcher that
// fetch uses process-wide. See lib/httpPool.ts.
keepConnectionsWarm()

const app = express()

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5180')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({ origin: FRONTEND_ORIGINS, credentials: true }))

// Stripe's signature check needs the exact raw request body, so this must
// be registered with express.raw() before the global express.json() below
// ever gets a chance to parse (and thereby discard) it.
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookRouter)

// A deck carrying the teacher's own pictures can be several MB when it comes
// back for the file download, so that one route gets a larger limit — it must
// be registered before the global parser below, which would otherwise reject it.
app.use('/api/assignment-coach/export-file', express.json({ limit: '40mb' }))

app.use(express.json())
app.use(cookieParser())

// Render sets RENDER_GIT_COMMIT on every deploy, so health can answer the
// one question a plain "ok" can't: which revision is actually serving. Short
// form, to compare directly against `git log --oneline`.
const COMMIT = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev'

/// The container's memory ceiling, read from the cgroup the platform sets.
///
/// Worth the twenty lines: uploads were failing with a body-less 502, which
/// is what a process being killed for memory looks like from outside, and
/// there was no way to tell from here whether the instance had 512MB or 2GB.
/// Diagnosing that by deploying guesses is slow and mostly wrong.
function memoryLimitMb(): number | null {
  for (const path of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const raw = readFileSync(path, 'utf8').trim()
      if (raw === 'max') continue
      const bytes = Number(raw)
      // Unset limits are reported as something absurd rather than as absent.
      if (Number.isFinite(bytes) && bytes > 0 && bytes < 64 * 1024 * 1024 * 1024) {
        return Math.round(bytes / 1024 / 1024)
      }
    } catch {
      // Not this kernel's layout, or not readable. Try the next.
    }
  }
  return null
}

app.get('/api/health', (_req, res) => {
  const { rss, heapUsed } = process.memoryUsage()
  res.json({
    status: 'ok',
    commit: COMMIT,
    // Operational, not sensitive: how much room this process has and how much
    // of it is gone. Nothing here identifies anyone.
    memory: {
      rssMb: Math.round(rss / 1024 / 1024),
      heapUsedMb: Math.round(heapUsed / 1024 / 1024),
      limitMb: memoryLimitMb(),
      uptimeS: Math.round(process.uptime()),
    },
  })
})

// Public: sign-in itself, and shared read-only links (no session needed).
app.use('/api/auth', authRouter)
app.use('/api/share', shareRouter)
// Public by design — the website chatbot answers visitors who have no account.
// Carries its own IP + global rate limits; see routes/support.ts.
app.use('/api/support', supportRouter)
// Public POST (own IP + global limits); GET/PATCH are superadmin-only inside.
app.use('/api/school-inquiries', schoolInquiriesRouter)
// Public, but only Telegram knows the secret header it checks; see routes/telegram.ts.
app.use('/api/telegram/webhook', telegramWebhookRouter)

// Everything else requires a signed-in user.
app.use('/api/scenarios', requireAuth, scenariosRouter)
app.use('/api/attempts', requireAuth, attemptsRouter)
app.use('/api/profile', requireAuth, profileRouter)
app.use('/api/debriefs', requireAuth, debriefRouter)
app.use('/api/follow-ups', requireAuth, followUpsRouter)
app.use('/api/parent-messages', requireAuth, parentMessageRouter)
app.use('/api/admin', requireAuth, adminRouter)
app.use('/api/billing', requireAuth, billingRouter)
app.use('/api/audio-sessions', requireAuth, audioSessionsRouter)
app.use('/api/lesson-plans', requireAuth, lessonPlansRouter)
app.use('/api/conversation-prep', requireAuth, conversationPrepRouter)
app.use('/api/conversation-plans', requireAuth, conversationPlanRouter)
app.use('/api/assignment-coach', requireAuth, assignmentCoachRouter)
app.use('/api/tts', requireAuth, ttsRouter)
app.use('/api/onboarding', requireAuth, onboardingRouter)
app.use('/api/telegram', requireAuth, telegramRouter)

// A process that dies should say why. Render restarts it either way, so the
// only thing lost without this is the reason — and a restart mid-session
// looks, from the browser, like an unexplained 500 on whatever was in
// flight. Behaviour is unchanged: Node ends the process on both of these.
process.on('uncaughtException', (error) => {
  console.error('[fatal] uncaught exception:', error)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled rejection:', reason)
  process.exit(1)
})

const port = Number(process.env.PORT) || 3001
const server = app.listen(port, () => {
  console.log(`Wivoza API listening on http://localhost:${port}`)
})

// Live transcription runs over a WebSocket rather than a route, so it
// attaches to the server rather than the Express app. It authenticates the
// upgrade itself with the same session token the HTTP middleware checks.
attachLiveSttServer(server, FRONTEND_ORIGINS)

// Deletes Lesson Debrief sessions past each teacher's retention setting.
startRetentionSweeps()

// A transcription started by the previous process did not survive it. Release
// those rows at boot so nobody is left watching a progress ring with no job
// behind it.
void failOrphanedTranscriptions()
void failOrphanedAnalyses()

// Talk It Through over Telegram; inert unless TELEGRAM_BOT_TOKEN is set.
startTelegramBot()
