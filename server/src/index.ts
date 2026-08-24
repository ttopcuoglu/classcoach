import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { adminRouter } from './routes/admin.ts'
import { attemptsRouter } from './routes/attempts.ts'
import { authRouter } from './routes/auth.ts'
import { debriefRouter } from './routes/debrief.ts'
import { parentMessageRouter } from './routes/parentMessage.ts'
import { profileRouter } from './routes/profile.ts'
import { qaRouter } from './routes/qa.ts'
import { scenariosRouter } from './routes/scenarios.ts'
import { shareRouter } from './routes/share.ts'
import { requireAuth } from './lib/auth.ts'

const app = express()

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5180'

app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Public: sign-in itself, and shared read-only links (no session needed).
app.use('/api/auth', authRouter)
app.use('/api/share', shareRouter)

// Everything else requires a signed-in user.
app.use('/api/scenarios', requireAuth, scenariosRouter)
app.use('/api/attempts', requireAuth, attemptsRouter)
app.use('/api/qa', requireAuth, qaRouter)
app.use('/api/profile', requireAuth, profileRouter)
app.use('/api/debriefs', requireAuth, debriefRouter)
app.use('/api/parent-messages', requireAuth, parentMessageRouter)
app.use('/api/admin', requireAuth, adminRouter)

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`ClassCoach API listening on http://localhost:${port}`)
})
