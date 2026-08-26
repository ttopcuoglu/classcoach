import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { isValidConversationPrepCategory } from '../lib/conversationPrepCategories.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const conversationPrepRouter = Router()

// Coaching focus shifts per category — same base prompt, one guidance line
// swapped in, rather than four near-duplicate prompts.
const CATEGORY_GUIDANCE: Record<string, string> = {
  hostile_response:
    'This is a reply to a message the teacher already received that was angry, accusatory, or hostile. Focus on de-escalation and professional tone: does the reply stay calm and non-defensive, and does it address the underlying concern instead of escalating?',
  phone_call:
    'This is a phone call the teacher needs to make — a different medium than writing, and one many teachers dread. Focus on clarity and delivery for a spoken conversation: is the opening clear, is it easy to follow out loud, does it invite dialogue instead of turning into a lecture?',
  boundary_setting:
    "This is about saying no or holding a limit with a parent or colleague who is asking for something the teacher can't or shouldn't grant. Focus on whether the response holds the boundary clearly while staying warm — not over-explaining, not getting pulled into an argument, not caving.",
  formal_meeting:
    "This is the teacher's part in a formal meeting (parent-teacher conference, IEP/504, or similar) with specific people in the room. Focus on whether the response anticipates likely questions or pushback from those attendees and has a clear plan for closing with concrete next steps.",
}

function buildSystemPrompt(category: string): string {
  const guidance = CATEGORY_GUIDANCE[category] ?? ''
  return `You are a warm, practical communication coach for K-12 teachers preparing for a real, upcoming conversation outside the classroom — with a parent, colleague, or administrator. This is not a hypothetical: the teacher is about to have this conversation for real. Coach, don't grade.

${guidance}

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these three sections and nothing outside them:

<feedback>
Specific, practical coaching on their planned response — what's working, what to adjust before they actually have this conversation. Keep it skimmable and encouraging.
</feedback>
<model_response>
A model version of what they could say instead, grounded in their specific situation — not a generic script.
</model_response>
<rating>
A single integer 1-5 rating of your honest private assessment of how well-prepared this response is. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. Output only the digit, nothing else.
</rating>`
}

conversationPrepRouter.get('/', async (req, res) => {
  const { saved, category } = req.query
  const preps = await prisma.conversationPrep.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof category === 'string' ? { category } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(preps)
})

conversationPrepRouter.post('/', async (req, res) => {
  const { category, situationText, responseText } = req.body ?? {}

  if (!isValidConversationPrepCategory(category)) {
    res.status(400).json({ error: 'category must be one of the known conversation types' })
    return
  }
  if (typeof situationText !== 'string' || !situationText.trim()) {
    res.status(400).json({ error: 'situationText is required' })
    return
  }
  if (typeof responseText !== 'string' || !responseText.trim()) {
    res.status(400).json({ error: 'responseText is required' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_prep_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = `Situation: ${situationText.trim()}\n\nMy planned response: ${responseText.trim()}`

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(category),
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const modelResponse = extractTag(text, 'model_response')
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const prep = await prisma.conversationPrep.create({
      data: {
        userId: req.user!.userId,
        category,
        situationText: situationText.trim(),
        responseText: responseText.trim(),
        feedback,
        modelResponse,
        rating,
      },
    })
    res.status(201).json(prep)
  } catch (error) {
    console.error('[conversation-prep] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

conversationPrepRouter.patch('/:id', async (req, res) => {
  const { saved } = req.body ?? {}
  if (typeof saved !== 'boolean') {
    res.status(400).json({ error: 'saved must be a boolean' })
    return
  }
  const { count } = await prisma.conversationPrep.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: { saved },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Conversation prep not found' })
    return
  }
  const prep = await prisma.conversationPrep.findUnique({ where: { id: req.params.id } })
  res.json(prep)
})

conversationPrepRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.conversationPrep.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Conversation prep not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const prep = await prisma.conversationPrep.update({ where: { id: req.params.id }, data: { shareToken } })
  res.json({ shareToken: prep.shareToken })
})
