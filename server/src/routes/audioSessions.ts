import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { analyzeTranscript, buildContentExhibits, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { CORE_COACHING_RULES, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { transcribeAudio } from '../lib/deepgram.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const audioSessionsRouter = Router()

// Audio only ever lives in memory long enough to reach Deepgram — never on
// disk, never attached to the session row.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

const STATUSES = ['setup', 'recording', 'paused', 'transcribing', 'tagging', 'analyzed', 'locked']

const REFLECT_SUMMARY_SYSTEM_PROMPT = `You are a warm, practical instructional coach. Below is the transcript of a reflective conversation you just had with a teacher about their own class recording. Summarize it into brief, specific draft notes the teacher can edit — ground every claim only in what was actually said in the conversation, never invent a detail that wasn't discussed.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly these three sections and nothing outside them:

<strengths>
1-2 specific strengths that came up in the conversation.
</strengths>
<growth_areas>
1-2 growth areas that came up — at most two, don't overwhelm.
</growth_areas>
<next_step>
One concrete, small next step the teacher landed on or that fits what they said.
</next_step>
${CORE_COACHING_RULES}`

const REFLECT_TURN_CAP = 8
const REFLECT_START_MESSAGE = 'Start our reflection conversation.'

const CONTENT_NOTE_LABELS = new Set(['Clarity', 'Vocabulary', 'Engagement with content', 'Worth double-checking'])
const MIN_CONTENT_EXHIBITS = 3
const NOT_ENOUGH_CONTENT_ERROR = 'Not enough subject-specific content detected to generate notes this session.'

type ContentNote = { id: string; label: string; text: string; timestampSec: number; excerpt: string }

function buildContentNotesSystemPrompt(subject: string, exhibits: { text: string; timestampSec: number }[]): string {
  const subjectLabel = subject.replace('_', ' ')
  return `You are a supportive ${subjectLabel} content-area specialist reviewing a brief excerpt from a classroom. Your tone is warm, collegial, and constructive — like a helpful colleague, never a critic. Assume good intent and strong subject knowledge on the teacher's part.

You are working from a short audio transcript excerpt only. You have not seen the full lesson, materials, board work, or planning documents, and audio transcription may contain errors. Do not state or imply factual corrections with confidence — frame anything content-related as a question, a suggestion to double-check, or an observation, never as an assertion that something is wrong.

Focus primarily on things you can reasonably assess from spoken language alone: clarity of explanation, whether key vocabulary was defined, whether examples helped build understanding, whether the content connects to what students likely already know. Avoid commenting on strict factual accuracy unless a claim is unambiguous and verifiably incorrect independent of context — and even then, phrase it as a gentle check, not a correction.

Never invent or assume standards, curriculum, or grade-level expectations not evident in the transcript.

Below are numbered excerpts from the transcript, each an exact quote. Write 2-4 short notes, each grounded in exactly one excerpt below — reference it only by its number, never quote or restate the excerpt text yourself.

${exhibits.map((e, i) => `[${i + 1}] ${e.text}`).join('\n')}

Write in plain text only — no markdown.

Respond with exactly this block, repeated 2 to 4 times, and nothing else:
<note>
<label>one of: Clarity, Vocabulary, Engagement with content, Worth double-checking</label>
<exhibit>the excerpt number this note is grounded in</exhibit>
<text>1-2 sentences of warm, constructive feedback</text>
</note>

Reserve "Worth double-checking" strictly for a concrete, plainly-stated factual claim — never for opinions, interpretations, or open-ended discussion — and always phrase it as a question, e.g. "Worth double-checking: ... — was that the intended framing?" Use it rarely, and only include it at all if something genuinely fits.
${CORE_COACHING_RULES}`
}

function parseContentNotes(text: string, exhibits: { text: string; timestampSec: number }[]): ContentNote[] {
  const blocks = text.match(/<note>[\s\S]*?<\/note>/g) ?? []
  const notes: ContentNote[] = []
  for (const block of blocks) {
    const label = extractTag(block, 'label')
    const exhibitStr = extractTag(block, 'exhibit')
    const noteText = extractTag(block, 'text')
    const exhibitIndex = exhibitStr ? Number.parseInt(exhibitStr, 10) - 1 : NaN
    const exhibit = exhibits[exhibitIndex]
    if (!label || !CONTENT_NOTE_LABELS.has(label) || !noteText || !exhibit) continue
    notes.push({
      id: `${Date.now()}-${notes.length}`,
      label,
      text: noteText,
      timestampSec: exhibit.timestampSec,
      excerpt: exhibit.text,
    })
    if (notes.length >= 4) break
  }
  return notes
}

type ReflectMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

function buildReflectSystemPrompt(context: string[]): string {
  return `You are a warm, practical instructional coach having a short, real-time reflective conversation with a
teacher right after their own class recording was analyzed. This is not a written report — it's a live,
back-and-forth chat. Keep every reply to 2-4 sentences, conversational, and grounded only in the facts
below and in what the teacher has said so far. Never invent a detail — a number, a quote, a moment —
that isn't given to you.

You're in Reflect mode: help the teacher notice and interpret what happened, don't prescribe a fix, and
end with one genuine, open question. When you offer an interpretation rather than a plain fact, label it
as one — "One possibility is...", "This may suggest...", "This coincided with..." — rather than stating
it as settled. Don't say one moment caused another unless the facts below clearly show that.

Ask one open, specific question at a time rather than several. Build on what the teacher just said
instead of listing unrelated observations. Coach, don't grade — there's no right answer you're steering
them toward.

Write in plain text only — no markdown (no **bold**, no # headings, no bullet lists).

Here is what's known about this session, and safe to reference (only measured or confidently-zero data —
nothing here is a guess):
${context.map((line) => `- ${line}`).join('\n')}

If the teacher asks about something not covered above, say plainly that the data doesn't cover it rather
than guessing.
${TRANSCRIPT_RELIABILITY_NOTICE}
${CORE_COACHING_RULES}`
}

function isValidStatus(value: unknown): value is string {
  return typeof value === 'string' && STATUSES.includes(value)
}

audioSessionsRouter.get('/', async (req, res) => {
  const userId = req.user!.userId

  // Lazy retention enforcement — no background job in this app, so any
  // list read first clears anything past its retention date.
  await prisma.audioSession.deleteMany({
    where: { userId, deleteAfter: { lt: new Date() } },
  })

  const sessions = await prisma.audioSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  res.json(sessions)
})

audioSessionsRouter.get('/:id', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  res.json(session)
})

audioSessionsRouter.post('/', async (req, res) => {
  const { teacherName, classSubject, period, gradeLevel, sessionDate, consentConfirmed } = req.body ?? {}

  if (consentConfirmed !== true) {
    res.status(400).json({ error: 'Recording consent must be confirmed before a session can be created.' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  const deleteAfter =
    user?.audioRetentionDays != null
      ? new Date(Date.now() + user.audioRetentionDays * 24 * 60 * 60 * 1000)
      : null

  const session = await prisma.audioSession.create({
    data: {
      userId: req.user!.userId,
      teacherName: typeof teacherName === 'string' ? teacherName : null,
      classSubject: typeof classSubject === 'string' ? classSubject : null,
      period: typeof period === 'string' ? period : null,
      gradeLevel: typeof gradeLevel === 'string' ? gradeLevel : null,
      sessionDate: typeof sessionDate === 'string' ? new Date(sessionDate) : new Date(),
      consentConfirmed: true,
      deleteAfter,
    },
  })
  res.status(201).json(session)
})

audioSessionsRouter.patch('/:id', async (req, res) => {
  const { teacherName, classSubject, period, gradeLevel, sessionDate, status, strengths, growthAreas, nextStep, followUpDate, phases, durationSec } =
    req.body ?? {}

  if (status !== undefined && !isValidStatus(status)) {
    res.status(400).json({ error: 'Invalid status' })
    return
  }
  if (phases !== undefined && !Array.isArray(phases)) {
    res.status(400).json({ error: 'phases must be an array' })
    return
  }

  const { count } = await prisma.audioSession.updateMany({
    where: { id: req.params.id, userId: req.user!.userId },
    data: {
      ...(teacherName !== undefined ? { teacherName } : {}),
      ...(classSubject !== undefined ? { classSubject } : {}),
      ...(period !== undefined ? { period } : {}),
      ...(gradeLevel !== undefined ? { gradeLevel } : {}),
      ...(sessionDate !== undefined ? { sessionDate: new Date(sessionDate) } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(strengths !== undefined ? { strengths } : {}),
      ...(growthAreas !== undefined ? { growthAreas } : {}),
      ...(nextStep !== undefined ? { nextStep } : {}),
      ...(followUpDate !== undefined ? { followUpDate: followUpDate ? new Date(followUpDate) : null } : {}),
      ...(phases !== undefined ? { phases } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
    },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  const session = await prisma.audioSession.findUnique({ where: { id: req.params.id } })
  res.json(session)
})

audioSessionsRouter.post('/:id/transcribe', upload.single('audio'), async (req, res) => {
  const sessionId = req.params.id as string
  const session = await prisma.audioSession.findFirst({
    where: { id: sessionId, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No audio file received' })
    return
  }

  try {
    const utterances = await transcribeAudio(req.file.buffer, req.file.mimetype)
    // req.file.buffer is never referenced again after this point — nothing
    // in this handler writes it to disk, logs it, or attaches it to the row.

    if (utterances.length === 0) {
      res.status(422).json({ error: 'No speech was detected in this recording.' })
      return
    }

    const segments = await prisma.$transaction(
      utterances.map((u) =>
        prisma.transcriptSegment.create({
          data: {
            sessionId: session.id,
            rawSpeakerTag: `Speaker ${u.speaker}`,
            speakerLabel: `Speaker ${u.speaker}`,
            startSec: u.start,
            endSec: u.end,
            text: u.transcript,
          },
        }),
      ),
    )

    const durationSec = Math.round(Math.max(...utterances.map((u) => u.end)))
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { status: 'tagging', durationSec },
    })

    const speakerSamples = new Map<string, string>()
    for (const segment of segments) {
      if (!speakerSamples.has(segment.rawSpeakerTag) && segment.text.trim()) {
        speakerSamples.set(segment.rawSpeakerTag, segment.text)
      }
    }

    res.json({
      speakers: Array.from(speakerSamples.entries()).map(([rawSpeakerTag, sample]) => ({ rawSpeakerTag, sample })),
    })
  } catch (error) {
    console.error('[audio-sessions] transcription failed:', error)
    res.status(502).json({ error: 'Transcription failed. Please try again.' })
  }
})

audioSessionsRouter.post('/:id/tag-speaker', async (req, res) => {
  const { rawSpeakerTag } = req.body ?? {}
  if (typeof rawSpeakerTag !== 'string' || !rawSpeakerTag.trim()) {
    res.status(400).json({ error: 'rawSpeakerTag is required' })
    return
  }

  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: true },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }

  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag },
    data: { speakerLabel: 'Teacher' },
  })
  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { not: rawSpeakerTag } },
    data: { speakerLabel: 'Student' },
  })

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({
      where: { sessionId: session.id },
      orderBy: { startSec: 'asc' },
    })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))

  const analysis = analyzeTranscript(segments)
  const lessonContent = detectLessonContent(segments, analysis.phases)

  // Notes are no longer auto-generated from raw metrics here — they're
  // populated later from the Reflect tab's actual coaching conversation
  // (see reflect-summary below), so the teacher doesn't see two independent
  // AI-written takeaways derived from the same numbers.
  const updated = await prisma.audioSession.update({
    where: { id: session.id },
    data: {
      status: 'analyzed',
      teacherTalkPct: analysis.teacherTalkPct,
      studentTalkPct: analysis.studentTalkPct,
      questionCount: analysis.questionCount,
      higherOrderPct: analysis.higherOrderPct,
      avgWaitTimeSec: analysis.avgWaitTimeSec,
      cfuCount: analysis.cfuCount,
      metricsDetail: analysis.metricsDetail,
      highlights: analysis.highlights,
      phases: analysis.phases,
      questionLog: analysis.questionLog,
      lessonContent,
    },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })

  res.json(updated)
})

audioSessionsRouter.post('/:id/reflect-chat', async (req, res) => {
  const { message, context } = req.body ?? {}
  const safeContext: string[] = Array.isArray(context) ? context.filter((c) => typeof c === 'string') : []

  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (session.status === 'locked') {
    res.status(403).json({ error: 'This report is locked and can no longer be edited.' })
    return
  }

  const existing = (session.reflectConversation as unknown as ReflectMessage[] | null) ?? []
  const isStart = existing.length === 0 && typeof message !== 'string'

  if (!isStart && (typeof message !== 'string' || !message.trim())) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const userTurnCount = existing.filter((m) => m.role === 'user').length
  if (!isStart && userTurnCount >= REFLECT_TURN_CAP) {
    res.status(409).json({ error: "You've reached today's reflection limit for this session." })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'reflect_chat')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  try {
    const messages = [
      ...existing.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: isStart ? REFLECT_START_MESSAGE : trimmedMessage },
    ]

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: buildReflectSystemPrompt(safeContext),
      messages,
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.reflectChat')
    const reply = text.trim()

    const now = new Date().toISOString()
    const newTurns: ReflectMessage[] = isStart
      ? [{ role: 'assistant', text: reply, createdAt: now }]
      : [
          { role: 'user', text: trimmedMessage, createdAt: now },
          { role: 'assistant', text: reply, createdAt: now },
        ]

    const updated = await prisma.audioSession.update({
      where: { id: session.id },
      data: { reflectConversation: [...existing, ...newTurns] },
    })
    res.json(updated)
  } catch (error) {
    console.error('[audio-sessions] reflect chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

audioSessionsRouter.post('/:id/reflect-summary', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (session.status === 'locked') {
    res.status(403).json({ error: 'This report is locked and can no longer be edited.' })
    return
  }

  const conversation = (session.reflectConversation as unknown as ReflectMessage[] | null) ?? []
  if (conversation.length === 0) {
    res.status(400).json({ error: 'Start a reflection conversation first.' })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'audio_session_notes')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const transcript = conversation
      .map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      system: REFLECT_SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.reflectSummary')

    res.json({
      strengths: extractTag(text, 'strengths'),
      growthAreas: extractTag(text, 'growth_areas'),
      nextStep: extractTag(text, 'next_step'),
    })
  } catch (error) {
    console.error('[audio-sessions] reflect summary failed:', error)
    res.status(502).json({ error: 'Could not summarize your conversation. Please try again.' })
  }
})

audioSessionsRouter.post('/:id/content-notes', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: true },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (session.status === 'locked') {
    res.status(403).json({ error: 'This report is locked and can no longer be edited.' })
    return
  }

  const lessonContent = session.lessonContent as unknown as { subject: string | null } | null
  const subject = lessonContent?.subject ?? null
  if (!subject) {
    res.status(400).json({ error: NOT_ENOUGH_CONTENT_ERROR })
    return
  }

  const segments: Segment[] = session.segments.map((s) => ({
    speakerLabel: s.speakerLabel,
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text,
  }))
  const exhibits = buildContentExhibits(segments)
  if (exhibits.length < MIN_CONTENT_EXHIBITS) {
    res.status(400).json({ error: NOT_ENOUGH_CONTENT_ERROR })
    return
  }

  const allowed = await checkAndLogUsage(req.user!.userId, 'content_notes')
  if (!allowed) {
    res.status(429).json({ error: "You've reached today's practice limit — try again tomorrow." })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 600,
      system: buildContentNotesSystemPrompt(subject, exhibits),
      messages: [{ role: 'user', content: 'Write the notes now.' }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.contentNotes')

    const notes = parseContentNotes(text, exhibits)
    if (notes.length === 0) {
      res.status(502).json({ error: 'Could not generate content notes. Please try again.' })
      return
    }

    const updated = await prisma.audioSession.update({
      where: { id: session.id },
      data: { contentNotes: { subject, notes } },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    })
    res.json(updated)
  } catch (error) {
    console.error('[audio-sessions] content notes failed:', error)
    res.status(502).json({ error: 'Could not generate content notes. Please try again.' })
  }
})

audioSessionsRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.audioSession.deleteMany({
    where: { id: req.params.id, userId: req.user!.userId },
  })
  if (count === 0) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  res.json({ status: 'ok' })
})
