import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import {
  isValidChallengeType,
  isValidConversationDifficulty,
  isValidRecipientType,
  isValidReviewMode,
} from '../lib/communicationOptions.ts'
import { appendTurn, CHAT_TURN_CAP, countUserTurns, toClaudeMessages, type ChatMessage } from '../lib/coachingChat.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { pickGradeBand } from '../lib/scenarioCategories.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const conversationPrepRouter = Router()

// Coaching focus shifts per challenge type — same base prompt, one guidance
// line swapped in, rather than near-duplicate prompts per type.
const CHALLENGE_GUIDANCE: Record<string, string> = {
  angry_accusatory: 'The other person is angry or accusatory. Focus on de-escalation and professional tone: does the teacher stay calm and non-defensive, and address the underlying concern instead of escalating?',
  grade_dispute: 'This is a dispute over a grade. Focus on whether the teacher grounds the response in clear, objective evidence (the rubric, the assignment criteria) rather than getting pulled into a subjective argument.',
  behavior_concern: 'This is about a behavior concern. Focus on whether the teacher states the concern objectively, without labeling the person, and moves toward a concrete next step.',
  attendance_concern: 'This is about an attendance concern. Focus on whether the teacher is clear about the impact and invites problem-solving rather than just reporting a rule violation.',
  unmotivated_student: 'The student is unmotivated or disengaged. Focus on whether the teacher stays encouraging and curious about the cause rather than framing it as a character flaw.',
  boundary_setting: "This is about saying no or holding a limit. Focus on whether the response holds the boundary clearly while staying warm — not over-explaining, not getting pulled into an argument, not caving.",
  disagreement_colleague: 'This is a disagreement with a colleague. Focus on whether the teacher stays collegial and solution-focused rather than defensive or dismissive.',
  formal_meeting: "This is the teacher's part in a formal meeting (parent-teacher conference, IEP/504, or similar) with specific people in the room. Focus on whether the response anticipates likely questions or pushback and has a clear plan for closing with concrete next steps.",
  other_custom: 'Coach based on the specific situation described.',
}

const SCENARIO_CHALLENGE_GUIDANCE: Record<string, string> = {
  angry_accusatory: 'Write a short, angry or accusatory message or opening line from the other person, addressed to the teacher, that the teacher now needs to respond to.',
  grade_dispute: 'Describe a situation where the other person is disputing a grade the teacher gave.',
  behavior_concern: 'Describe a behavior incident the teacher now needs to discuss with the other person.',
  attendance_concern: 'Describe an attendance or tardiness pattern the teacher needs to raise.',
  unmotivated_student: 'Describe a student who has become noticeably unmotivated or disengaged, that the teacher wants to check in about.',
  boundary_setting: 'Describe the other person asking the teacher for something unreasonable or against policy, requiring the teacher to say no or set a limit.',
  disagreement_colleague: 'Describe a disagreement between the teacher and a colleague over an approach, decision, or classroom matter.',
  formal_meeting: 'Describe an upcoming formal meeting (IEP/504, parent-teacher conference, or team meeting), including who is attending and what needs to be decided or communicated.',
  other_custom: 'Describe a realistic, specific classroom-adjacent conversation the teacher needs to have.',
}

const PERSON_GUIDANCE: Record<string, string> = {
  parent_caregiver: "The other person is the student's parent or caregiver.",
  student: 'The other person is the student themselves — age-appropriate, still a real conversation.',
  colleague: 'The other person is a fellow teacher or staff member.',
  administrator: 'The other person is a school administrator.',
}

const DIFFICULTY_GUIDANCE: Record<string, string> = {
  supportive: 'The other person should be cooperative and easy to work with.',
  concerned: 'The other person should be worried but reasonable — asks real questions, not hostile.',
  resistant: 'The other person should push back and be somewhat defensive or reluctant to agree.',
  highly_escalated: 'The other person should start emotionally heightened — upset, defensive, or confrontational — testing the teacher\'s ability to stay grounded.',
}

const GRADE_BAND_GUIDANCE: Record<string, string> = {
  'K-5': "The child involved is elementary-age (grades K-5). Ground the situation in elementary concerns — reading level, playground incidents, separation anxiety, following directions — not teen-specific issues like phones, grades pressure, or social media.",
  '6-8': 'The child involved is a middle schooler (grades 6-8). Ground the situation in middle-school concerns — peer social dynamics, homework load, early independence, first real conflicts with friends.',
  '9-12': "The child involved is a high schooler (grades 9-12). Ground the situation in high-school concerns — grades and college pressure, driving, jobs, greater autonomy, or a more contentious tone than a younger child's parent might use.",
}

const GENERATE_SCENARIO_SYSTEM_PROMPT = `You write realistic hypothetical situations so K-12 teachers can practice a difficult conversation before they face a real one.

Rules:
- Write 2-4 sentences describing the situation and the other person's opening position or message.
- Be concrete and specific — include enough detail that a real response requires judgment, not just "he was upset."
- Never include real, identifiable people — use generic descriptions like "a parent" or "a colleague."
- Respond with ONLY the situation text. No title, label, or preamble.`

function buildPracticeSystemPrompt(category: string | null, personType: string | null, difficulty: string | null): string {
  const guidance = [
    category ? CHALLENGE_GUIDANCE[category] : null,
    personType ? PERSON_GUIDANCE[personType] : null,
    difficulty ? DIFFICULTY_GUIDANCE[difficulty] : null,
  ]
    .filter(Boolean)
    .join(' ')

  return `You are a warm, practical communication coach for K-12 teachers practicing a hypothetical difficult conversation. Coach, don't grade.

${guidance}

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these eleven sections and nothing outside them, rating each of the first six as one of: Strong, Developing, or Needs Work.

<clarity_rating>
</clarity_rating>
<clarity_feedback>
Actionable feedback on how clearly the teacher stated the concern and what they wanted.
</clarity_feedback>
<empathy_rating>
</empathy_rating>
<empathy_feedback>
Actionable feedback on how well the response showed empathy for the other person's perspective.
</empathy_feedback>
<evidence_rating>
</evidence_rating>
<evidence_feedback>
Actionable feedback on the teacher's use of specific facts/evidence rather than vague impressions.
</evidence_feedback>
<boundaries_rating>
</boundaries_rating>
<boundaries_feedback>
Actionable feedback on whether the teacher maintained professional boundaries.
</boundaries_feedback>
<collaboration_rating>
</collaboration_rating>
<collaboration_feedback>
Actionable feedback on how collaborative/partnership-oriented the response was.
</collaboration_feedback>
<resolution_rating>
</resolution_rating>
<resolution_feedback>
Actionable feedback on whether the response moved toward resolution and next steps.
</resolution_feedback>
<did_well>
One or two sentences on what the teacher did well.
</did_well>
<priority>
The single highest-priority thing to improve.
</priority>
<stronger_phrase>
One specific stronger phrase the teacher could have used instead.
</stronger_phrase>
<model_response>
A complete, natural example of what the teacher could have said instead, start to finish — grounded in the specific situation, not a generic script.
</model_response>
<next_step>
A concrete suggested next step.
</next_step>`
}

function buildPracticeChatSystemPrompt(category: string | null): string {
  const guidance = category ? CHALLENGE_GUIDANCE[category] ?? '' : ''
  return `You are a warm, practical communication coach for K-12 teachers, continuing a conversation about a practice difficult-conversation exchange you already gave feedback on. ${guidance}

Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Build on what the teacher says; stay grounded in their specific situation; never invent details.`
}

const REVIEW_SYSTEM_PROMPT = `You are a warm, practical communication coach for K-12 teachers reviewing a message they received and a response they're planning to send. Coach, don't grade.

Evaluate for: tone and professionalism, clarity, empathy, defensive or emotional language, blaming language, unsupported assumptions, accidental promises the teacher may not be able to keep, confidential or sensitive information that shouldn't be shared this way, missing facts, and missing next steps. If the situation may call for administrator involvement (e.g. a safety concern, a legal claim, a pattern of hostility, a special-education/504 dispute), say so plainly — but never state a definitive legal conclusion, only that it's worth looping in an administrator or the appropriate staff member.

Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these sections and nothing outside them:

<overall>
One or two sentences summarizing the overall assessment.
</overall>
<works_well>
What's working well in the planned response.
</works_well>
<problem>
What may create a problem if sent as-is. Empty if nothing significant.
</problem>
<recommended_changes>
Specific, actionable changes to make.
</recommended_changes>
{{REVISED_RESPONSE_SECTION}}
<escalation_guidance>
Only include real guidance here if the situation may warrant administrator/staff involvement, phrased as a suggestion to loop someone in, never a legal conclusion. Leave this section empty if nothing applies.
</escalation_guidance>`

function buildReviewSystemPrompt(reviewMode: string | null): string {
  const wantsRewrite = reviewMode === 'rewrite_only' || reviewMode === 'both'
  const section = wantsRewrite
    ? `<revised_response>\nA revised version of the response, ready to send.\n</revised_response>`
    : ''
  return REVIEW_SYSTEM_PROMPT.replace('{{REVISED_RESPONSE_SECTION}}', section)
}

const REVIEW_CHAT_SYSTEM_PROMPT = `You are a warm, practical communication coach for K-12 teachers, continuing a discussion about a message they received and their planned response, which you already reviewed. Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Refer back to the original message and response throughout; never invent details. If asked to rewrite part of the response, you may include the specific revised wording in your reply.`

type CoachingReport = {
  clarity: { rating: string; feedback: string }
  empathy: { rating: string; feedback: string }
  evidence: { rating: string; feedback: string }
  boundaries: { rating: string; feedback: string }
  collaboration: { rating: string; feedback: string }
  resolution: { rating: string; feedback: string }
  didWell: string
  priority: string
  strongerPhrase: string
  modelResponse: string
  nextStep: string
}

function parseCoachingReport(text: string): CoachingReport | null {
  const dim = (tag: string) => ({
    rating: extractTag(text, `${tag}_rating`) ?? '',
    feedback: extractTag(text, `${tag}_feedback`) ?? '',
  })
  const report: CoachingReport = {
    clarity: dim('clarity'),
    empathy: dim('empathy'),
    evidence: dim('evidence'),
    boundaries: dim('boundaries'),
    collaboration: dim('collaboration'),
    resolution: dim('resolution'),
    didWell: extractTag(text, 'did_well') ?? '',
    priority: extractTag(text, 'priority') ?? '',
    modelResponse: extractTag(text, 'model_response') ?? '',
    strongerPhrase: extractTag(text, 'stronger_phrase') ?? '',
    nextStep: extractTag(text, 'next_step') ?? '',
  }
  const hasContent = Object.values(report).some((v) => (typeof v === 'string' ? v : v.feedback))
  return hasContent ? report : null
}

conversationPrepRouter.get('/', async (req, res) => {
  const { saved, category, source } = req.query
  const preps = await prisma.conversationPrep.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof source === 'string' ? { source } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(preps)
})

conversationPrepRouter.post('/generate-scenario', async (req, res) => {
  const { category, gradeBand, personType, difficulty } = req.body ?? {}

  if (!isValidChallengeType(category)) {
    res.status(400).json({ error: 'category must be one of the known challenge types' })
    return
  }
  const chosenGradeBand = pickGradeBand(gradeBand)
  const resolvedPersonType = isValidRecipientType(personType) ? personType : null
  const resolvedDifficulty = isValidConversationDifficulty(difficulty) ? difficulty : null

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_prep_generate')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context = [
      SCENARIO_CHALLENGE_GUIDANCE[category],
      resolvedPersonType ? PERSON_GUIDANCE[resolvedPersonType] : null,
      resolvedPersonType === 'student' ? GRADE_BAND_GUIDANCE[chosenGradeBand] : null,
      resolvedDifficulty ? DIFFICULTY_GUIDANCE[resolvedDifficulty] : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: GENERATE_SCENARIO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context }],
    })
    const situationText = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    res.json({ situationText, gradeBand: chosenGradeBand })
  } catch (error) {
    console.error('[conversation-prep] scenario generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

conversationPrepRouter.post('/', async (req, res) => {
  const { category, situationText, responseText, source, gradeBand, personType, difficulty, reviewMode } = req.body ?? {}

  const resolvedSource: 'practice' | 'review' = source === 'practice' ? 'practice' : 'review'

  if (resolvedSource === 'practice' && !isValidChallengeType(category)) {
    res.status(400).json({ error: 'category must be one of the known challenge types' })
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
  const resolvedGradeBand = typeof gradeBand === 'string' && gradeBand.trim() ? pickGradeBand(gradeBand) : null
  const resolvedPersonType = isValidRecipientType(personType) ? personType : null
  const resolvedDifficulty = isValidConversationDifficulty(difficulty) ? difficulty : null
  const resolvedReviewMode = isValidReviewMode(reviewMode) ? reviewMode : 'both'
  const resolvedCategory = resolvedSource === 'practice' && isValidChallengeType(category) ? category : null

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_prep_feedback')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const context =
      resolvedSource === 'practice'
        ? [
            resolvedGradeBand ? `Grade level: ${resolvedGradeBand}` : null,
            `Situation: ${situationText.trim()}`,
            `My response: ${responseText.trim()}`,
          ]
            .filter(Boolean)
            .join('\n\n')
        : [`Message received:\n${situationText.trim()}`, `My planned response:\n${responseText.trim()}`].join('\n\n')

    const systemPrompt =
      resolvedSource === 'practice'
        ? buildPracticeSystemPrompt(resolvedCategory, resolvedPersonType, resolvedDifficulty)
        : buildReviewSystemPrompt(resolvedReviewMode)

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Practice's report is 11 tagged sections including a full model
      // response script — 1400 was cutting the response off before the
      // last one or two tags. Review's output is shorter but shares this
      // budget too; extra headroom there is harmless.
      max_tokens: 2400,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    let feedback: string | null = null
    let modelResponse: string | null = null
    let coachingReport: CoachingReport | null = null

    if (resolvedSource === 'practice') {
      coachingReport = parseCoachingReport(text)
      if (!coachingReport) {
        res.status(502).json({ error: 'Could not generate coaching feedback. Please try again.' })
        return
      }
    } else {
      const overall = extractTag(text, 'overall')
      const worksWell = extractTag(text, 'works_well')
      const problem = extractTag(text, 'problem')
      const recommendedChanges = extractTag(text, 'recommended_changes')
      const escalation = extractTag(text, 'escalation_guidance')
      modelResponse = extractTag(text, 'revised_response')
      feedback = [
        overall ? `Overall: ${overall}` : null,
        worksWell ? `What works well:\n${worksWell}` : null,
        problem ? `What may create a problem:\n${problem}` : null,
        recommendedChanges ? `Recommended changes:\n${recommendedChanges}` : null,
        escalation ? `Consider administrator involvement:\n${escalation}` : null,
      ]
        .filter(Boolean)
        .join('\n\n')
      if (!feedback) {
        res.status(502).json({ error: 'Could not generate feedback. Please try again.' })
        return
      }
    }

    const seedReply =
      resolvedSource === 'practice'
        ? `Priority: ${coachingReport!.priority}\n\n${coachingReport!.didWell}`
        : [feedback, modelResponse ? `Revised response:\n${modelResponse}` : null].filter(Boolean).join('\n\n')
    const conversation = appendTurn([], context, seedReply)

    const prep = await prisma.conversationPrep.create({
      data: {
        userId: req.user!.userId,
        category: resolvedCategory,
        personType: resolvedSource === 'practice' ? resolvedPersonType : null,
        difficulty: resolvedSource === 'practice' ? resolvedDifficulty : null,
        reviewMode: resolvedSource === 'review' ? resolvedReviewMode : null,
        source: resolvedSource,
        gradeBand: resolvedGradeBand,
        situationText: situationText.trim(),
        responseText: responseText.trim(),
        feedback,
        modelResponse,
        coachingReport: coachingReport ?? undefined,
        conversation,
      },
    })
    res.status(201).json(prep)
  } catch (error) {
    console.error('[conversation-prep] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

conversationPrepRouter.post('/:id/chat', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const prep = await prisma.conversationPrep.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!prep) {
    res.status(404).json({ error: 'Conversation prep not found' })
    return
  }

  const existing = (prep.conversation as unknown as ChatMessage[] | null) ?? []
  if (countUserTurns(existing) >= CHAT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's practice limit for this conversation." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'conversation_prep_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmed = message.trim()
  try {
    const systemPrompt = prep.source === 'practice' ? buildPracticeChatSystemPrompt(prep.category) : REVIEW_CHAT_SYSTEM_PROMPT
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: toClaudeMessages(existing, trimmed),
    })
    const reply = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()

    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    const updated = await prisma.conversationPrep.update({
      where: { id: prep.id },
      data: { conversation: appendTurn(existing, trimmed, reply) },
    })
    res.json(updated)
  } catch (error) {
    console.error('[conversation-prep] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

conversationPrepRouter.patch('/:id', async (req, res) => {
  const { saved, title } = req.body ?? {}
  const data: { saved?: boolean; title?: string } = {}
  if (saved !== undefined) {
    if (typeof saved !== 'boolean') {
      res.status(400).json({ error: 'saved must be a boolean' })
      return
    }
    data.saved = saved
  }
  if (title !== undefined) {
    if (typeof title !== 'string') {
      res.status(400).json({ error: 'title must be a string' })
      return
    }
    data.title = title.trim() || undefined
  }
  const { count } = await prisma.conversationPrep.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data,
  })
  if (count === 0) {
    res.status(404).json({ error: 'Conversation prep not found' })
    return
  }
  const prep = await prisma.conversationPrep.findUnique({ where: { id: req.params.id } })
  res.json(prep)
})

conversationPrepRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.conversationPrep.deleteMany({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Conversation prep not found' })
    return
  }
  res.json({ success: true })
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
