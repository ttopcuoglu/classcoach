import { Router, type NextFunction, type Request, type Response } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { extractTag, stripStructuralTags } from '../lib/extractTag.ts'
import { leaderChatPrompt, leaderFeedbackPrompt } from '../lib/leaderCoaching.ts'
import { findLeaderLevel, type LeaderLevelInfo } from '../lib/leaderLevels.ts'
import { LEADER_AUDIENCES, findScenarioForLevel, scenariosForLevel } from '../lib/leaderScenarios.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

// Leader's Corner. Everything here is the signed-in leader's own: a
// superadmin-assigned level decides which scenarios they can open, and every
// attempt is read and written by userId alone. No admin route reads
// LeaderAttempt (leaders.privacy.test.ts holds that).

export const leadersRouter = Router()

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      leaderLevel?: LeaderLevelInfo
    }
  }
}

// The level is read from the database on every request, never from the
// session token: a superadmin removing someone's level takes effect on their
// very next click, not when their session happens to expire.
async function requireLeader(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { leaderLevel: true } })
  const level = findLeaderLevel(user?.leaderLevel)
  if (!level) {
    res.status(403).json({ error: "Leader's Corner isn't turned on for your account." })
    return
  }
  req.leaderLevel = level
  next()
}

leadersRouter.use(requireLeader)

// The leader's own level and its scenarios — never another level's.
leadersRouter.get('/scenarios', (req, res) => {
  const level = req.leaderLevel!
  res.json({
    level: { value: level.value, label: level.label, titles: level.titles },
    audiences: LEADER_AUDIENCES,
    scenarios: scenariosForLevel(level.value).map(({ id, audience, title, text }) => ({ id, audience, title, text })),
  })
})

leadersRouter.get('/attempts', async (req, res) => {
  const attempts = await prisma.leaderAttempt.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  res.json(attempts)
})

leadersRouter.get('/attempts/:id', async (req, res) => {
  const attempt = await prisma.leaderAttempt.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!attempt) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(attempt)
})

// One call for both ways in: a curated scenario of their level (scenarioId),
// or their own situation (situationText). Only their own situation may come
// without a response, which asks the coach to walk them through it.
leadersRouter.post('/attempts', async (req, res) => {
  const level = req.leaderLevel!
  const { scenarioId, situationText, responseText } = req.body ?? {}
  const response = typeof responseText === 'string' ? responseText.trim() : ''
  if (response.length > 5000) {
    res.status(400).json({ error: 'Keep your response under 5,000 characters.' })
    return
  }

  let source: 'curated' | 'own'
  let scenarioText: string
  let curatedId: string | null = null
  let audience: string | null = null
  if (scenarioId !== undefined) {
    const scenario = findScenarioForLevel(scenarioId, level.value)
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' })
      return
    }
    if (!response) {
      res.status(400).json({ error: 'Say how you would handle it, then get feedback.' })
      return
    }
    source = 'curated'
    scenarioText = scenario.text
    curatedId = scenario.id
    audience = scenario.audience
  } else {
    const trimmed = typeof situationText === 'string' ? situationText.trim() : ''
    if (trimmed.length < 15) {
      res.status(400).json({ error: 'Say a little more about what is happening.' })
      return
    }
    if (trimmed.length > 3000) {
      res.status(400).json({ error: 'That is longer than a situation needs — keep it under 3,000 characters.' })
      return
    }
    source = 'own'
    scenarioText = trimmed
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'leader_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const own = source === 'own'
  const walkThrough = own && !response
  const context = `${own ? "The situation, in the leader's own words" : 'Scenario'}: ${scenarioText}\n\n${
    walkThrough ? "The leader hasn't decided what to say yet — walk them through it." : `Leader's response: ${response}`
  }`
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1400,
      // Thinking draws from max_tokens on this model; left on, a dense
      // scenario can come back with no text at all (see attempts.ts).
      thinking: { type: 'disabled' },
      system: leaderFeedbackPrompt(level, own, walkThrough),
      messages: [{ role: 'user', content: context }],
    })
    const text = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    if (!text.trim()) {
      console.error('[leaders] empty completion; stop_reason:', reply.stop_reason)
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    const feedback = extractTag(text, 'feedback') ?? stripStructuralTags(text)
    const modelResponse = extractTag(text, 'model_response')
    const seedReply = [feedback, modelResponse ? `Model response: ${modelResponse}` : null].filter(Boolean).join('\n\n')

    const attempt = await prisma.leaderAttempt.create({
      data: {
        userId: req.user!.userId,
        level: level.value,
        source,
        curatedId,
        audience,
        scenarioText,
        responseText: response,
        feedback,
        modelResponse,
        conversation: appendTurn([], context, seedReply),
      },
    })
    res.status(201).json(attempt)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[leaders] feedback failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

leadersRouter.post('/attempts/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }
  const attempt = await prisma.leaderAttempt.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!attempt) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const existing = (attempt.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: CONVERSATION_FULL_MESSAGE })
    return
  }
  const denied = await checkAndLogUsage(req.user!.userId, 'leader_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  // Coached at the level they practiced at, so a later level change doesn't
  // rewrite what an old conversation assumed they could promise.
  const level = findLeaderLevel(attempt.level) ?? req.leaderLevel!
  const trimmed = message.trim()
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: leaderChatPrompt(level, attempt.source === 'own'),
      messages: toClaudeMessages(existing, trimmed),
    })
    const text = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    const updated = await prisma.leaderAttempt.update({
      where: { id: attempt.id },
      data: { conversation: appendTurn(existing, trimmed, text) },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[leaders] chat failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

leadersRouter.patch('/attempts/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  const { count } = await prisma.leaderAttempt.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { saved },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(await prisma.leaderAttempt.findUnique({ where: { id: req.params.id } }))
})
