import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { hasActivePlan } from '../lib/billing.ts'
import {
  applyMemoryUpdate,
  buildMemoryContextBlock,
  MEMORY_UPDATE_INSTRUCTION,
  MEMORY_UPDATE_TOKEN_BUFFER,
} from '../lib/coachMemory.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES } from '../lib/coachPersona.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { transcribeAudio } from '../lib/deepgram.ts'
import { extractTag, stripTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { SCENARIO_CATEGORIES } from '../lib/scenarioCategories.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const debriefRouter = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// Talk It Through records audio client-side (MediaRecorder) and transcribes
// it here rather than relying on the browser's Web Speech API, which iOS
// Safari never implements — same transcription pipeline as onboarding's
// live demo and Audio Coaching. Not usage-capped: the real cost (the Claude
// call in /talk and /:id/chat below) is already gated.
debriefRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file received' })
    return
  }
  try {
    const utterances = await transcribeAudio(req.file.buffer, req.file.mimetype)
    const transcript = utterances
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((u) => u.transcript)
      .join(' ')
      .trim()
    res.json({ transcript })
  } catch (error) {
    console.error('[debrief] transcription failed:', error)
    res.status(502).json({ error: 'Could not transcribe the recording. Please try again.' })
  }
})

const ASK_SYSTEM_PROMPT = `You are a warm, practical classroom management coach for grades 6-12 teachers. A teacher has written in — figure out which of these two situations it is before responding:

- A real incident that ALREADY HAPPENED in their classroom (a specific moment, not a hypothetical). Respond with reflective, forward-looking coaching: help them make sense of what happened and plan for next time.
- A general classroom-management question, not tied to a specific incident (e.g. "what's a good way to set expectations on day one?"). Respond with a direct, concrete answer plus actionable steps.

Coach, don't grade, either way. Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these sections and nothing outside them:

<feedback>
For a real incident: a tentative, hedged read on what may be happening — use language like "one possibility is..." or "this may suggest...", never assert a student's motive as fact. Cover what worked and what to consider differently, grounded in classroom management best practice (clear/consistent expectations, de-escalation, restorative practices). For a general question: a direct, concrete answer. Either way, keep it skimmable, encouraging, and practical.
</feedback>
<words_to_try>
1-2 short, specific lines of language the teacher could actually say in the moment — phrasing to adapt to their own voice, not a script to recite verbatim. For a general question, give a phrase or framing that applies.
</words_to_try>
<follow_up>
For a real incident: a concrete next step — how to follow up with the student(s) involved, repair the relationship if needed, or handle it differently if it happens again. For a general question: a natural extension, like a related consideration or an offer to help them practice/draft something. Never leave this empty.
</follow_up>
<category>
If this describes a real incident that clearly fits one of these categories, output its exact value: defiance, disengagement, peer_conflict, disruption, transitions, technology_misuse. Otherwise (a general question, or an incident that doesn't clearly fit one of those), output the literal word none. Output only the value, nothing else.
</category>
<rating>
For a real incident: a single integer 1-5, your honest private assessment of how effectively it was handled, per classroom management best practice. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. For a general question, there's nothing to rate — output 0. Output only the digit, nothing else.
</rating>
${CORE_COACHING_RULES}`

const ASK_CHAT_SYSTEM_PROMPT = `You are a warm, practical classroom management coach for grades 6-12 teachers, continuing a conversation you already gave coaching feedback in. Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Build on what the teacher says: if they push back, ask a follow-up, or want to think through a different angle, engage with that directly rather than repeating your first assessment. Stay grounded in what they've told you; never invent details.
${CORE_COACHING_RULES}`

// Used for both the first "Talk to Me" turn and every follow-up — same
// persona/pacing throughout a live spoken conversation, unlike Ask's
// separate "first response" vs. "chat" prompts.
const TALK_SYSTEM_PROMPT = `You are Coach, a warm, practical classroom management coach for K-12 teachers, having a live SPOKEN conversation — the teacher is talking to you out loud and your reply will be read aloud back to them, so length itself costs them time. Default to ONE short, direct sentence. Use a second sentence only when it adds real, necessary content — never to soften, preface, or restate what they just said. Skip warm-up phrases like "That's a great question" or "I hear you" — start with the actual answer or the actual question. Give a concrete, specific answer or next step, not a general reflection. Ask at most one question, and only when you genuinely need more information to help. Plain conversational language, no lists, no markdown, no parenthetical asides. Stay grounded in what the teacher has actually said; never invent details.
${CORE_COACHING_RULES}`

// Manually triggered once, when the teacher taps "Finish session" — not a
// turn in the live conversation, so no memory plumbing and no spoken-
// pacing constraint the way TALK_SYSTEM_PROMPT has.
const TALK_TAKEAWAY_SYSTEM_PROMPT = `You are Coach, wrapping up a short spoken coaching conversation with a teacher. Summarize it into a brief, honest takeaway the teacher can glance at afterward — ground every claim only in what was actually said, never invent a detail that wasn't discussed.

Write in plain text only — no markdown.

Respond with exactly these three sections and nothing else:
<explored>
1-2 sentences on what the conversation was actually about.
</explored>
<try_next>
One concrete, small next step that came out of the conversation, or that clearly fits what the teacher described.
</try_next>
<notice>
One specific thing worth paying attention to next time, tied to what was discussed.
</notice>
${CORE_COACHING_RULES}`

function isValidCategory(value: unknown): value is string {
  return typeof value === 'string' && (SCENARIO_CATEGORIES as readonly string[]).includes(value)
}

debriefRouter.get('/', async (req, res) => {
  const { saved, category, source } = req.query
  const debriefs = await prisma.debrief.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(source === 'ask_tab' ? { OR: [{ source: 'ask_tab' }, { source: null }] } : typeof source === 'string' ? { source } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(debriefs)
})

debriefRouter.post('/', async (req, res) => {
  const { incidentText } = req.body ?? {}
  if (typeof incidentText !== 'string' || incidentText.trim().length === 0) {
    res.status(400).json({ error: 'incidentText is required' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'debrief_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))

    const context = `What happened: ${incidentText}`
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: memoryOn
        ? `${ASK_SYSTEM_PROMPT}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}`
        : ASK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.ask')

    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const wordsToTry = extractTag(text, 'words_to_try')
    const followUp = extractTag(text, 'follow_up')
    const categoryTag = extractTag(text, 'category')
    const category = categoryTag && isValidCategory(categoryTag) ? categoryTag : null
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const seedReply = [feedback, followUp ? `Next time: ${followUp}` : null].filter(Boolean).join('\n\n')
    const conversation = appendTurn([], context, seedReply)

    const debrief = await prisma.debrief.create({
      data: { userId: req.user!.userId, incidentText, category, feedback, wordsToTry, followUp, rating, conversation },
    })

    if (memoryOn) {
      const memoryUpdate = applyMemoryUpdate(extractTag(text, 'memory_update'), user!.coachMemory)
      if (memoryUpdate !== user!.coachMemory) {
        await prisma.user.update({ where: { id: req.user!.userId }, data: { coachMemory: memoryUpdate } })
      }
    }

    res.status(201).json(debrief)
  } catch (error) {
    console.error('[debrief] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

debriefRouter.post('/talk', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'talk_to_me')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: memoryOn ? 80 + MEMORY_UPDATE_TOKEN_BUFFER : 80,
      thinking: { type: 'disabled' },
      system: memoryOn
        ? `${TALK_SYSTEM_PROMPT}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}`
        : TALK_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.talk')
    const reply = stripTag(text, 'memory_update')

    if (!reply) {
      res.status(502).json({ error: 'Could not reach Coach. Please try again.' })
      return
    }

    const conversation = appendTurn([], trimmed, reply)
    const debrief = await prisma.debrief.create({
      data: { userId: req.user!.userId, incidentText: trimmed, source: 'talk_to_me', conversation },
    })

    if (memoryOn) {
      const memoryUpdate = applyMemoryUpdate(extractTag(text, 'memory_update'), user!.coachMemory)
      if (memoryUpdate !== user!.coachMemory) {
        await prisma.user.update({ where: { id: req.user!.userId }, data: { coachMemory: memoryUpdate } })
      }
    }

    res.status(201).json(debrief)
  } catch (error) {
    console.error('[debrief] talk-to-me start failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

debriefRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const debrief = await prisma.debrief.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!debrief) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }

  const existing = (debrief.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const isTalk = debrief.source === 'talk_to_me'
  const allowed = await checkAndLogUsage(req.user!.userId, isTalk ? 'talk_to_me_chat' : 'debrief_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))

    const basePrompt = isTalk ? TALK_SYSTEM_PROMPT : ASK_CHAT_SYSTEM_PROMPT
    const baseMaxTokens = isTalk ? 80 : 300
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: memoryOn ? baseMaxTokens + MEMORY_UPDATE_TOKEN_BUFFER : baseMaxTokens,
      thinking: { type: 'disabled' },
      system: memoryOn
        ? `${basePrompt}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}`
        : basePrompt,
      messages: toClaudeMessages(existing, trimmed),
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, isTalk ? 'debrief.talk.chat' : 'debrief.ask.chat')
    const reply = stripTag(text, 'memory_update')

    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    const updated = await prisma.debrief.update({
      where: { id: debrief.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
    })

    if (memoryOn) {
      const memoryUpdate = applyMemoryUpdate(extractTag(text, 'memory_update'), user!.coachMemory)
      if (memoryUpdate !== user!.coachMemory) {
        await prisma.user.update({ where: { id: req.user!.userId }, data: { coachMemory: memoryUpdate } })
      }
    }

    res.json(updated)
  } catch (error) {
    console.error('[debrief] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

debriefRouter.post('/:id/takeaway', async (req, res) => {
  const debrief = await prisma.debrief.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!debrief) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }
  if (debrief.source !== 'talk_to_me') {
    res.status(400).json({ error: 'Not a Talk It Through conversation.' })
    return
  }

  const existing = (debrief.conversation as unknown as ChatMessage[] | null) ?? []
  if (existing.length === 0) {
    res.status(400).json({ error: 'Nothing to summarize yet.' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'talk_to_me_takeaway')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const transcript = existing.map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`).join('\n')
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: TALK_TAKEAWAY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.talk.takeaway')

    const explored = extractTag(text, 'explored')
    const tryNext = extractTag(text, 'try_next')
    const notice = extractTag(text, 'notice')
    if (!explored || !tryNext || !notice) {
      res.status(502).json({ error: 'Could not summarize this conversation. Please try again.' })
      return
    }

    const updated = await prisma.debrief.update({
      where: { id: debrief.id },
      data: { talkTakeaway: { explored, tryNext, notice } },
    })
    res.json(updated)
  } catch (error) {
    console.error('[debrief] takeaway failed:', error)
    res.status(502).json({ error: 'Could not summarize this conversation. Please try again.' })
  }
})

debriefRouter.patch('/:id', async (req, res) => {
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
  const { count } = await prisma.debrief.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: {
      ...(saved !== undefined ? { saved } : {}),
      ...(markTried === true ? { triedAt: new Date() } : {}),
      ...(reflectionNote !== undefined ? { reflectionNote } : {}),
    },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }
  const debrief = await prisma.debrief.findUnique({ where: { id: req.params.id } })
  res.json(debrief)
})

debriefRouter.post('/:id/share', async (req, res) => {
  const existing = await prisma.debrief.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }
  const shareToken = existing.shareToken ?? generateShareToken()
  const debrief = await prisma.debrief.update({ where: { id: req.params.id }, data: { shareToken } })
  res.json({ shareToken: debrief.shareToken })
})
