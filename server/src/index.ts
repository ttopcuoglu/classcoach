import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { attemptsRouter } from './routes/attempts.ts'
import { claudeRouter } from './routes/claude.ts'
import { profileRouter } from './routes/profile.ts'
import { qaRouter } from './routes/qa.ts'
import { scenariosRouter } from './routes/scenarios.ts'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/scenarios', scenariosRouter)
app.use('/api/attempts', attemptsRouter)
app.use('/api/qa', qaRouter)
app.use('/api/profile', profileRouter)
app.use('/api/claude', claudeRouter)

const port = Number(process.env.PORT) || 3001
app.listen(port, () => {
  console.log(`ClassCoach API listening on http://localhost:${port}`)
})
