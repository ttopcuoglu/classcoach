import { Router, type NextFunction, type Request, type Response } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { extractTag, stripStructuralTags } from '../lib/extractTag.ts'
import {
  leaderChatPrompt,
  leaderFeedbackPrompt,
  leaderHintPrompt,
  leaderScenarioPrompt,
  leaderWalkChatPrompt,
  leaderWalkOpenPrompt,
  walkCoachingNote,
} from '../lib/leaderCoaching.ts'
import { chooseAudience, generateContext, isGeneratedId, readGenerated, signGenerated } from '../lib/leaderGenerated.ts'
import { findLeaderLevel, leaderProfile, LEADER_AREAS, type LeaderProfile } from '../lib/leaderLevels.ts'
import { LEADER_AUDIENCES, findScenarioFor, scenariosFor } from '../lib/leaderScenarios.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

// Leader's Corner. Everything here is the signed-in leader's own: a
// superadmin-assigned level, areas and evaluates flag decide which scenarios
// they can open, and every
// attempt is read and written by userId alone. No admin route reads
// LeaderAttempt (leaders.privacy.test.ts holds that).

export const leadersRouter = Router()

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      leader?: LeaderProfile
    }
  }
}

// The level is read from the database on every request, never from the
// session token: a superadmin removing someone's level takes effect on their
// very next click, not when their session happens to expire.
async function requireLeader(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { leaderLevel: true, leaderAreas: true, leaderEvaluates: true },
  })
  const leader = leaderProfile(user)
  if (!leader) {
    res.status(403).json({ error: "Leader's Corner isn't turned on for your account." })
    return
  }
  req.leader = leader
  next()
}

leadersRouter.use(requireLeader)

// A curated scenario of theirs, or one the server generated for their level.
function findScenario(id: unknown, who: LeaderProfile) {
  return findScenarioFor(id, who) ?? readGenerated(id, who)
}

// The leader's own scenarios — never another level's, area's, or the
// evaluator-only ones when they don't evaluate.
leadersRouter.get('/scenarios', (req, res) => {
  const who = req.leader!
  const { level } = who
  res.json({
    level: { value: level.value, label: level.label, titles: level.titles },
    areas: LEADER_AREAS.filter((a) => who.areas.includes(a.value)),
    evaluates: who.evaluates,
    audiences: LEADER_AUDIENCES,
    scenarios: scenariosFor(who).map(({ id, audience, title, text }) => ({ id, audience, title, text })),
  })
})

// "Generate a scenario": a new one for their level, areas and evaluation
// side, with a signed id so the rest of the page treats it like a curated one.
// Not stored until they practice it. `previous` is the titles the page has
// already generated, so the next one is a different situation.
leadersRouter.post('/scenarios/generate', async (req, res) => {
  const who = req.leader!
  const audience = chooseAudience(who, req.body?.audience)
  const previous = Array.isArray(req.body?.previous)
    ? (req.body.previous as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 20).map((t) => t.slice(0, 120))
    : []
  const denied = await checkAndLogUsage(req.user!.userId, 'leader_generate')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      thinking: { type: 'disabled' },
      system: leaderScenarioPrompt(who),
      messages: [{ role: 'user', content: generateContext(who, audience, previous) }],
    })
    const raw = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    const text = (extractTag(raw, 'scenario') ?? stripStructuralTags(raw)).trim()
    const title = (extractTag(raw, 'title') ?? 'A new scenario').trim().slice(0, 120)
    if (text.length < 40) {
      console.error('[leaders] generate came back empty; stop_reason:', reply.stop_reason)
      res.status(502).json({ error: 'Could not write a scenario. Please try again.' })
      return
    }
    const { id } = signGenerated(who.level.value, audience, title, text.slice(0, 3000))
    res.status(201).json({ id, audience, title, text: text.slice(0, 3000) })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not write a scenario')
    logModelFailure('[leaders] generate failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// "Get a hint" on one of their own scenarios, curated or generated. Not stored: a hint only
// matters while the response box is empty. `previous` is what the page already
// showed, so "Another hint" points somewhere new.
leadersRouter.post('/scenarios/:id/hint', async (req, res) => {
  const who = req.leader!
  const scenario = findScenario(req.params.id, who)
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  const previous = Array.isArray(req.body?.previous)
    ? (req.body.previous as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 5).map((h) => h.slice(0, 300))
    : []
  const denied = await checkAndLogUsage(req.user!.userId, 'leader_hint')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 150,
      thinking: { type: 'disabled' },
      system: leaderHintPrompt(who, previous),
      messages: [{ role: 'user', content: `Scenario: ${scenario.text}` }],
    })
    const hint = stripStructuralTags(
      reply.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' '),
    )
    if (!hint) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }
    res.json({ hint })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[leaders] hint failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
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
// or their own situation (situationText). With no response it starts Walk me
// through it instead — their own situation left empty, or a scenario where
// they tapped it (walkThrough: true): the coach opens a conversation, and
// the coaching waits for Get coaching (POST /attempts/:id/coaching).
leadersRouter.post('/attempts', async (req, res) => {
  const who = req.leader!
  const { scenarioId, situationText, responseText, walkThrough: askedToWalk } = req.body ?? {}
  const response = askedToWalk === true ? '' : typeof responseText === 'string' ? responseText.trim() : ''
  if (response.length > 5000) {
    res.status(400).json({ error: 'Keep your response under 5,000 characters.' })
    return
  }

  let source: 'curated' | 'generated' | 'own'
  let scenarioText: string
  let curatedId: string | null = null
  let audience: string | null = null
  if (scenarioId !== undefined) {
    const scenario = findScenario(scenarioId, who)
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' })
      return
    }
    if (!response && askedToWalk !== true) {
      res.status(400).json({ error: 'Say how you would handle it, then get feedback.' })
      return
    }
    // A generated one stores no id: the signed id is the whole scenario, and
    // its text is already kept in scenarioText.
    const generated = isGeneratedId(scenario.id)
    source = generated ? 'generated' : 'curated'
    scenarioText = scenario.text
    curatedId = generated ? null : scenario.id
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
  const walkThrough = !response
  const context = `${own ? "The situation, in the leader's own words" : 'Scenario'}: ${scenarioText}\n\n${
    walkThrough ? "The leader hasn't decided what to say yet — walk them through it." : `Leader's response: ${response}`
  }`
  try {
    if (walkThrough) {
      const opening = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 250,
        thinking: { type: 'disabled' },
        system: leaderWalkOpenPrompt(who, own),
        messages: [{ role: 'user', content: context }],
      })
      const opener = opening.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      if (!opener) {
        console.error('[leaders] empty walk opener; stop_reason:', opening.stop_reason)
        res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
        return
      }
      const attempt = await prisma.leaderAttempt.create({
        data: {
          userId: req.user!.userId,
          level: who.level.value,
          source,
          curatedId,
          audience,
          scenarioText,
          responseText: '',
          conversation: appendTurn([], context, opener),
        },
      })
      res.status(201).json(attempt)
      return
    }

    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1400,
      // Thinking draws from max_tokens on this model; left on, a dense
      // scenario can come back with no text at all (see attempts.ts).
      thinking: { type: 'disabled' },
      system: leaderFeedbackPrompt(who, own, false),
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
        level: who.level.value,
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
  // A walk-through is a conversation before the coaching as well as after it,
  // so it gets room for both.
  const walk = !attempt.responseText.trim()
  if (countUserTurns(existing) >= (walk ? CHAT_TURN_CAP * 2 : CHAT_TURN_CAP)) {
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
  const who: LeaderProfile = { ...req.leader!, level: findLeaderLevel(attempt.level) ?? req.leader!.level }
  const trimmed = message.trim()
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system:
        walk && !attempt.feedback
          ? leaderWalkChatPrompt(who, attempt.source === 'own')
          : leaderChatPrompt(who, attempt.source === 'own') + (walk ? walkCoachingNote(attempt.feedback, attempt.modelResponse) : ''),
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

// Get coaching: ends a Walk me through it conversation with the full
// coaching and what they could say, built on what they worked out. Once only.
leadersRouter.post('/attempts/:id/coaching', async (req, res) => {
  const attempt = await prisma.leaderAttempt.findFirst({ where: { id: req.params.id, userId: req.user!.userId } })
  if (!attempt) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (attempt.responseText.trim() || attempt.feedback) {
    res.status(409).json({ error: 'This one already has its coaching.' })
    return
  }
  const denied = await checkAndLogUsage(req.user!.userId, 'leader_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }
  const who: LeaderProfile = { ...req.leader!, level: findLeaderLevel(attempt.level) ?? req.leader!.level }
  const existing = (attempt.conversation as unknown as ChatMessage[] | null) ?? []
  try {
    const reply = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1400,
      thinking: { type: 'disabled' },
      system: leaderFeedbackPrompt(who, attempt.source === 'own', true),
      messages: toClaudeMessages(existing, 'I am ready. Give me the full coaching and what I could say.'),
    })
    const text = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    if (!text.trim()) {
      console.error('[leaders] empty coaching; stop_reason:', reply.stop_reason)
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }
    const updated = await prisma.leaderAttempt.update({
      where: { id: attempt.id },
      data: { feedback: extractTag(text, 'feedback') ?? stripStructuralTags(text), modelResponse: extractTag(text, 'model_response') },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[leaders] coaching failed:', failure, error)
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
