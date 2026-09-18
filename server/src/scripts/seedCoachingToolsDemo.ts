// Adds one sample each of Plan a Conversation, Write a Message, Lesson
// Planning feedback and Assignment Coach review to a demo account — each
// continuing a thread from its Talk It Through and Lesson Debrief history,
// so every feature a teacher opens shows the same classes and people.
//
// Two steps, so nothing reaches the database until someone has read it:
//
//   npx tsx --env-file=.env src/scripts/seedCoachingToolsDemo.ts generate <out.json>
//   npx tsx --env-file=.env src/scripts/seedCoachingToolsDemo.ts insert <in.json> <email>
//
// The teacher's inputs are written here; everything Wivoza says back comes
// from the production prompts and parsers, imported from each route rather
// than copied.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { appendTurn, type ChatMessage } from '../lib/coachingChat.ts'
import { extractTag } from '../lib/extractTag.ts'
import {
  buildReviewStartPrompt,
  isReviewSnapshotEmpty,
  parseDetection,
  parseReviewSnapshot,
  START_MESSAGE,
} from '../routes/assignmentCoach.ts'
import { buildContext as buildPlanContext, parsePlan, PLAN_SYSTEM_PROMPT } from '../routes/conversationPlan.ts'
import { buildPromptHeader, FEEDBACK_SYSTEM_PROMPT, readContext } from '../routes/lessonPlans.ts'
import { buildContext as buildMessageContext, MESSAGE_SYSTEM_PROMPT, TONE_INSTRUCTIONS } from '../routes/parentMessage.ts'

async function claude(system: string, content: string, maxTokens: number): Promise<{ text: string; stopReason: string | null }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content }],
  })
  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return { text, stopReason: response.stop_reason }
}

// ---- The teacher's inputs ----

const CONVERSATION_PLAN = {
  createdAt: '2026-08-27T16:30:00-04:00',
  title: 'Private talk with a 4th period caller',
  body: {
    recipientType: 'student',
    meetingType: 'student',
    meetingFormat: 'in_person',
    attendees: 'Just me and one seventh grader from my 4th period class, before class starts.',
    situationText: `One of my 4th period seventh graders calls out constantly. This week I started a new routine — everyone writes for thirty seconds, checks with a neighbor, then I call on people — and he told me in front of the class that it's "slow". He's bright and he genuinely knows the answers; I think he likes being first. I want to talk with him privately before class, not in front of everyone.`,
    desiredOutcome: `He understands why the routine exists — so the quieter kids get a turn — and feels like I still value what he knows. Ideally he agrees to give it a real try for a week, and I'd like to give him a role in it, not a punishment.`,
    concerns: `I don't want this to feel like he's in trouble, and I really don't want a power struggle. He tends to joke his way out of serious conversations and can get defensive.`,
    background: `About five students call out a lot in 4th period, which is right after lunch. The new routine is working for the quiet kids — three of them raised their hands this week for the first time. Starting tomorrow, calling out means losing your turn and I'll come back to you later.`,
  },
}

const PARENT_MESSAGE = {
  createdAt: '2026-09-02T16:05:00-04:00',
  title: 'Positive note home — 1st period math',
  body: {
    startingAction: 'new',
    recipientType: 'parent_caregiver',
    purpose: 'positive_update',
    format: 'email',
    tone: 'warm',
    incidentSummary: `A positive note home about a sixth grader in my 1st period math class. At the start of the year she'd put her pencil down the moment she got stuck and say she's "not good at math." I've started opening class by making a mistake on purpose and talking out loud about how I catch it. Today, on a ratio problem, she got stuck — and instead of stopping, she wrote down what she noticed, found her own mistake, and fixed it. Then she explained it to her table partner. I want her family to know how big that is, and that this kind of persistence is exactly what will carry her in math.`,
  },
}

const ASSIGNMENT = {
  createdAt: '2026-09-03T20:10:00-04:00',
  originalText: `Of Mice and Men — Chapter 2 Analysis Paragraph
English 9, 2nd period

Claim: Steinbeck develops George as a character who is trapped by his responsibility for Lennie.

Your job: prove or complicate this claim in ONE paragraph (6–8 sentences).

1. Find ONE moment in Chapter 2 where the claim is shown. Start with: "This is shown when ___."
2. Quote the line, with the page number.
3. Explain your thinking: "___ because ___." The "because" is the most important part — it's where you explain WHY this moment reveals something about George. Don't just tell me what happened.
4. End with one sentence connecting this moment to one of the novel's bigger ideas: loneliness or dreams.

Due Friday at the start of class. Graded on the paragraph rubric: claim, evidence, reasoning, conventions.`,
  extraNote: `My students summarize instead of analyzing, so the main thing I want this to do is push them into explaining why. This is the first time I'm giving them the claim instead of asking them to come up with one.`,
}

const LESSON_PLAN = {
  createdAt: '2026-09-16T19:40:00-04:00',
  body: {
    objective: 'Students will analyze a primary source to make a claim about working conditions in early factories and support it with evidence.',
    unitName: 'The Industrial Revolution',
    subject: 'World History',
    gradeLevel: '10th',
  },
  planText: `8th period (last period of the day), 50 minutes.

Do Now (5 min): Photo of a textile mill interior on the board. Write one thing you notice and one question you have.

Mini-lesson (10 min): Quick review of the factory system and why it replaced cottage industry. Key vocabulary: factory system, textile mill, child labor.

Primary source (8 min): Excerpt of a factory worker's testimony to Parliament (Sadler Committee, 1832). I read the first paragraph aloud, then they read the rest silently.

Half-sheet (12 min): Thirty seconds on your own first — write down one thing that stands out to you. Then with your partner, agree on ONE claim about working conditions and ONE piece of evidence from the testimony. Both names on the half-sheet.

Share out (10 min): I call on pairs, not individuals — "What did your pair put down?" I push for evidence: which line in the testimony backs that up?

Exit ticket (5 min): Write down one thing you heard from another pair that changed your mind.

Note to self: this class is silent. The same three students answer everything and everyone else waits them out. Last time I tried think-pair-share the pairs just chatted about their weekend. The half-sheet is supposed to give pairs something they have to produce before anyone talks.`,
}

// ---- generate ----

type DemoFile = {
  generatedAt: string
  conversationPlan?: { context: string; planContent: NonNullable<ReturnType<typeof parsePlan>> }
  parentMessage?: { fullContext: string; draftText: string }
  assignment?: {
    reply: string
    detected: ReturnType<typeof parseDetection>['detected']
    clarifyingQuestion: ReturnType<typeof parseDetection>['clarifyingQuestion']
    reviewSnapshot: ReturnType<typeof parseReviewSnapshot>
  }
  lessonPlan?: { content: string; feedback: string; rating: number | null }
}

async function generate(outPath: string) {
  const file: DemoFile = existsSync(outPath)
    ? (JSON.parse(readFileSync(outPath, 'utf8')) as DemoFile)
    : { generatedAt: new Date().toISOString() }
  const save = () => writeFileSync(outPath, JSON.stringify(file, null, 2))

  if (!file.conversationPlan) {
    const { context, error } = buildPlanContext(CONVERSATION_PLAN.body)
    if (error) throw new Error(error)
    const { text, stopReason } = await claude(PLAN_SYSTEM_PROMPT, context, 2800)
    const planContent = parsePlan(text)
    if (!planContent) throw new Error(`conversation plan came back empty (stop_reason ${stopReason})`)
    file.conversationPlan = { context, planContent }
    save()
  }
  console.log('✓ conversation plan')

  if (!file.parentMessage) {
    const { context, error } = buildMessageContext(PARENT_MESSAGE.body)
    if (error) throw new Error(error)
    const fullContext = `${context}\n\nDesired tone: ${TONE_INSTRUCTIONS[PARENT_MESSAGE.body.tone]}`
    const { text } = await claude(MESSAGE_SYSTEM_PROMPT, fullContext, 700)
    file.parentMessage = { fullContext, draftText: text.trim() }
    save()
  }
  console.log('✓ parent message')

  if (!file.assignment) {
    const { text, stopReason } = await claude(buildReviewStartPrompt(ASSIGNMENT.originalText, ASSIGNMENT.extraNote), START_MESSAGE, 8192)
    const reply = extractTag(text, 'reply')
    const reviewSnapshot = parseReviewSnapshot(text)
    if (!reply || isReviewSnapshotEmpty(reviewSnapshot)) throw new Error(`assignment review came back incomplete (stop_reason ${stopReason})`)
    const { detected, clarifyingQuestion } = parseDetection(text)
    file.assignment = { reply, detected, clarifyingQuestion, reviewSnapshot }
    save()
  }
  console.log('✓ assignment review')

  if (!file.lessonPlan) {
    const context = readContext(LESSON_PLAN.body)
    const content = `${buildPromptHeader(context)}\n\nLesson plan:\n${LESSON_PLAN.planText.trim()}`
    const { text } = await claude(FEEDBACK_SYSTEM_PROMPT, content, 1024)
    const feedback = extractTag(text, 'feedback') ?? text.trim()
    const ratingText = extractTag(text, 'rating')
    const parsed = ratingText ? Number.parseInt(ratingText, 10) : NaN
    file.lessonPlan = { content, feedback, rating: parsed >= 1 && parsed <= 5 ? parsed : null }
    save()
  }
  console.log('✓ lesson plan feedback')
  console.log(`\nWrote ${outPath}`)
}

// ---- insert ----

// appendTurn stamps "now"; these conversations happened on their own dates.
function at(conversation: ChatMessage[], iso: string): ChatMessage[] {
  const start = new Date(iso).getTime()
  return conversation.map((m, i) => ({ ...m, createdAt: new Date(start + i * 40_000).toISOString() }))
}

async function insert(inPath: string, email: string) {
  const { prisma } = await import('../lib/prisma.ts')
  const file = JSON.parse(readFileSync(inPath, 'utf8')) as DemoFile
  const { conversationPlan, parentMessage, assignment, lessonPlan } = file
  if (!conversationPlan || !parentMessage || !assignment || !lessonPlan) throw new Error(`${inPath} is incomplete — run generate again.`)

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
  if (!user) throw new Error(`No account for ${email}.`)
  const existing = await Promise.all([
    prisma.conversationPlan.count({ where: { userId: user.id } }),
    prisma.parentMessage.count({ where: { userId: user.id } }),
    prisma.assignmentCoachSession.count({ where: { userId: user.id } }),
    prisma.lessonPlan.count({ where: { userId: user.id } }),
  ])
  if (existing.some((n) => n > 0)) throw new Error(`${email} already has samples in one of these features — not adding a second set.`)

  const plan = CONVERSATION_PLAN.body
  const planCreatedAt = new Date(CONVERSATION_PLAN.createdAt)
  const seedReply = `Opening: ${conversationPlan.planContent.opening}\n\nMain concern: ${conversationPlan.planContent.mainConcern}`
  await prisma.conversationPlan.create({
    data: {
      userId: user.id,
      recipientType: plan.recipientType,
      meetingType: plan.meetingType,
      meetingFormat: plan.meetingFormat,
      attendees: plan.attendees,
      situationText: plan.situationText,
      desiredOutcome: plan.desiredOutcome,
      concerns: plan.concerns,
      background: plan.background,
      planContent: conversationPlan.planContent,
      title: CONVERSATION_PLAN.title,
      saved: true,
      conversation: at(appendTurn([], conversationPlan.context, seedReply), CONVERSATION_PLAN.createdAt),
      createdAt: planCreatedAt,
    },
  })

  const message = PARENT_MESSAGE.body
  await prisma.parentMessage.create({
    data: {
      userId: user.id,
      startingAction: message.startingAction,
      incidentSummary: message.incidentSummary,
      recipientType: message.recipientType,
      purpose: message.purpose,
      format: message.format,
      tone: message.tone,
      draftText: parentMessage.draftText,
      title: PARENT_MESSAGE.title,
      saved: true,
      conversation: at(appendTurn([], parentMessage.fullContext, parentMessage.draftText), PARENT_MESSAGE.createdAt),
      createdAt: new Date(PARENT_MESSAGE.createdAt),
    },
  })

  const assignmentAt = new Date(ASSIGNMENT.createdAt)
  await prisma.assignmentCoachSession.create({
    data: {
      userId: user.id,
      mode: 'review',
      title: assignment.detected.title,
      assignmentType: assignment.detected.assignmentType,
      gradeLevel: assignment.detected.gradeLevel,
      subject: assignment.detected.subject,
      estimatedTime: assignment.detected.estimatedTime,
      objective: assignment.detected.objective,
      originalText: ASSIGNMENT.originalText,
      liveAssignmentText: ASSIGNMENT.originalText,
      conversation: [{ role: 'assistant', text: assignment.reply, createdAt: assignmentAt.toISOString() }],
      reviewSnapshot: assignment.reviewSnapshot,
      clarifyingQuestion: assignment.clarifyingQuestion ?? undefined,
      saved: true,
      createdAt: assignmentAt,
      updatedAt: assignmentAt,
    },
  })

  const context = readContext(LESSON_PLAN.body)
  await prisma.lessonPlan.create({
    data: {
      userId: user.id,
      mode: 'feedback',
      objective: context.objective || null,
      unitName: context.unitName,
      essentialQuestion: context.essentialQuestion,
      standard: context.standard,
      subject: context.subject,
      gradeLevel: context.gradeLevel,
      planText: LESSON_PLAN.planText.trim(),
      feedback: lessonPlan.feedback,
      rating: lessonPlan.rating,
      // Lesson Planning lists only saved plans.
      saved: true,
      conversation: at(appendTurn([], lessonPlan.content, lessonPlan.feedback), LESSON_PLAN.createdAt),
      createdAt: new Date(LESSON_PLAN.createdAt),
    },
  })

  console.log(`Added a conversation plan, a message, an assignment review and a lesson plan to ${email}.`)
  await prisma.$disconnect()
}

const [command, ...args] = process.argv.slice(2)
if (command === 'generate' && args[0]) {
  await generate(args[0])
} else if (command === 'insert' && args.length >= 2) {
  await insert(args[0], args[1])
} else {
  console.error('Usage: generate <out.json> | insert <in.json> <email>')
  process.exit(1)
}
