import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { appendTurn, CHAT_TURN_CAP, CONVERSATION_FULL_MESSAGE, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { buildExperienceContextBlock } from '../lib/experience.ts'
import { extractTag, stripStructuralTags } from '../lib/extractTag.ts'
import { findTopic, topicForKind, type Topic } from '../lib/topics.ts'
import { coachIdentity, ratingStandard, teachingContextBlock } from '../lib/focusAreaPrompt.ts'
import { prisma } from '../lib/prisma.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const attemptsRouter = Router()

// Built per attempt from the scenario's focus area: what "a good response"
// means is not the same standard for de-escalating a defiant student, sequencing
// an explanation, and answering an angry parent email, and the model response
// has to come out in the right channel — words said out loud in a classroom, or
// a sentence that can go in an email.
function feedbackSystemPrompt(area: Topic | null): string {
  // The topic's hard limits belong here, not only in the scenario writer's
  // prompt. Generation already refuses to write a scenario that speculates
  // about a student's diagnosis or home; feedback has to refuse to answer one
  // that way too, or the limit holds for half the exchange. Same for the
  // me-and-this-job threshold: a teacher who rehearses asking for help and
  // describes something heavier than a workload problem must be told so.
  const limits = area ? `\n\nHard limits for this topic:\n${area.safety}\n` : ''
  return `${coachIdentity(area)} You are reviewing how a teacher says they'd handle a practice scenario. Coach, don't grade.${limits}

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these four sections and nothing outside them:

<did>
What their move actually did — the effect it would have in the room, on the page, or on the person receiving it. Start from what is genuinely working; be specific about why it works rather than praising it. 2-4 sentences, no list.
</did>
<left>
What it left on the table: the one thing this response does not yet do, judged against ${ratingStandard(area)}. One thing, not three — name it plainly and say what to do instead. Never scold, and never imply the teacher should have known.
</left>
<keep>
One line worth keeping — a single sentence the teacher could actually say or write, in their own voice, that they could carry into the real version of this. Match the channel the scenario has: spoken words for a moment in front of students, a sentence for an email, an opening line for a conference or a conversation with a colleague, a question for a teaching problem, a decision and its reason for a grading call. Just the line itself, no framing around it.
</keep>
<rating>
A single integer 1-5 rating your honest private assessment of how well this response follows ${ratingStandard(area)}. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>
${CORE_COACHING_RULES}`
}

function attemptChatSystemPrompt(area: Topic | null): string {
  return `${coachIdentity(area)} You are continuing a conversation about a practice scenario you already gave feedback on. Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Build on what the teacher says: if they push back, ask a follow-up, or want to try a different angle, engage with that directly rather than repeating your first assessment. Stay grounded in the scenario and their response; never invent details that weren't given to you.
${CORE_COACHING_RULES}`
}

/// A scenario's topic: the stored value, or derived from its kind for rows
/// written before the topic axis existed.
///
/// Resolved against the seven topics rather than the four old focus areas,
/// because the two new ones carry the limits that matter most — feedback on a
/// `student_concern` rehearsal has to be held to its no-speculation rule, and
/// falling through to the generic coach identity would drop it silently.
function areaForScenario(scenario: { focusArea: string | null; category: string }): Topic | null {
  return findTopic(scenario.focusArea) ?? topicForKind(scenario.category)
}

attemptsRouter.get('/', async (req, res) => {
  const { scenarioId, saved } = req.query
  const attempts = await prisma.scenarioAttempt.findMany({
    where: {
      userId: req.user!.userId,
      ...(typeof scenarioId === 'string' ? { scenarioId } : {}),
      ...(saved === 'true' ? { saved: true } : {}),
    },
    include: { scenario: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json(attempts)
})

attemptsRouter.post('/', async (req, res) => {
  const { scenarioId, responseText } = req.body ?? {}
  if (typeof scenarioId !== 'string' || typeof responseText !== 'string') {
    res.status(400).json({ error: 'scenarioId and responseText are required strings' })
    return
  }
  const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } })
  if (!scenario) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'attempt_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { experienceLevel: true } })
    const context = `Scenario: ${scenario.text}\n\nTeacher's response: ${responseText}`
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // The per-area prompts and the scenarios they produce are both longer
      // than the single classroom-management pair they replaced, and the
      // rating sits at the end of the response where a tight cap eats it.
      max_tokens: 1400,
      // This model defaults to adaptive extended thinking when the param is
      // omitted, and thinking tokens come out of the same max_tokens budget —
      // on a dense scenario it spent the whole budget thinking and returned
      // zero text blocks, which stored a blank attempt and showed a teacher
      // empty coaching. Same trap already documented in lessonPlans.ts.
      thinking: { type: 'disabled' },
      system: `${feedbackSystemPrompt(areaForScenario(scenario))}${teachingContextBlock(scenario)}${buildExperienceContextBlock(user?.experienceLevel)}`,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    // An empty response means no usable coaching. Fail so the teacher sees
    // "please try again" and can resubmit, rather than banking a blank attempt
    // in their history that can never be recovered.
    if (!text.trim()) {
      console.error('[attempts] empty completion; stop_reason:', response.stop_reason)
      res.status(502).json({ error: 'Claude request failed' })
      return
    }

    const did = extractTag(text, 'did')
    const left = extractTag(text, 'left')
    const keep = extractTag(text, 'keep')
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    // The structured three-part shape, only when the model actually produced
    // the two coaching halves. A partial set is worse than none: the result
    // page would render a card with a heading and no body.
    const coachingParts = did && left ? { did, left, keep: keep ?? null } : null

    // feedback and modelResponse are still written, because the iOS app, the
    // printable export and the Cheat Sheet all read them. `feedback` is the
    // two coaching halves joined, which is what those surfaces showed anyway;
    // `keep` is the nearest thing to the model response they used to display.
    // A reply that produced no recognizable sections at all falls back to its
    // whole text rather than storing nothing.
    const feedback =
      did && left ? `${did}\n\n${left}` : (did ?? left ?? stripStructuralTags(text))
    const modelResponse = keep

    const seedReply = [feedback, keep ? `One line worth keeping: ${keep}` : null]
      .filter(Boolean)
      .join('\n\n')
    const conversation = appendTurn([], context, seedReply)

    const attempt = await prisma.scenarioAttempt.create({
      data: {
        userId: req.user!.userId,
        scenarioId,
        responseText,
        feedback,
        modelResponse,
        coachingParts: coachingParts ?? undefined,
        rating,
        conversation,
      },
      include: { scenario: true },
    })
    res.status(201).json(attempt)
  } catch (error) {
    console.error('[attempts] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

attemptsRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  // Includes the scenario so follow-up turns keep the area's coaching voice
  // rather than drifting back to a generic one.
  const attempt = await prisma.scenarioAttempt.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { scenario: true },
  })
  if (!attempt) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }

  const existing = (attempt.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: CONVERSATION_FULL_MESSAGE })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'attempt_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { experienceLevel: true } })
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      // Same reason as the feedback call above — at 300 tokens a single
      // thinking block would swallow the entire reply.
      thinking: { type: 'disabled' },
      system: `${attemptChatSystemPrompt(areaForScenario(attempt.scenario))}${teachingContextBlock(attempt.scenario)}${buildExperienceContextBlock(user?.experienceLevel)}`,
      messages: toClaudeMessages(existing, trimmed),
    })
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    const updated = await prisma.scenarioAttempt.update({
      where: { id: attempt.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
      include: { scenario: true },
    })
    res.json(updated)
  } catch (error) {
    console.error('[attempts] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

attemptsRouter.patch('/:id', async (req, res) => {
  const { saved, markTried, reflectionNote } = req.body ?? {}
  if (saved === undefined && markTried === undefined && reflectionNote === undefined) {
    res.status(400).json({ error: 'Nothing to update' })
    return
  }
  if (saved !== undefined && typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  if (markTried !== undefined && markTried !== true) {
    res.status(400).json({ error: 'markTried must be true' })
    return
  }
  if (reflectionNote !== undefined && typeof reflectionNote !== 'string') {
    res.status(400).json({ error: 'reflectionNote must be a string' })
    return
  }
  const { count } = await prisma.scenarioAttempt.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: {
      ...(saved !== undefined ? { saved } : {}),
      ...(markTried === true ? { triedAt: new Date() } : {}),
      ...(reflectionNote !== undefined ? { reflectionNote } : {}),
    },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }
  const attempt = await prisma.scenarioAttempt.findUnique({
    where: { id: req.params.id },
    include: { scenario: true },
  })
  res.json(attempt)
})

attemptsRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.scenarioAttempt.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Attempt not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const attempt = await prisma.scenarioAttempt.update({
    where: { id: req.params.id },
    data: { shareToken },
  })
  res.json({ shareToken: attempt.shareToken })
})
