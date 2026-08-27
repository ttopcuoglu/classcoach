import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { analyzeTranscript, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { transcribeAudio } from '../lib/deepgram.ts'
import { extractTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const audioSessionsRouter = Router()

// Audio only ever lives in memory long enough to reach Deepgram — never on
// disk, never attached to the session row.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

const STATUSES = ['setup', 'recording', 'paused', 'transcribing', 'tagging', 'analyzed', 'locked']

const NOTES_SYSTEM_PROMPT = `You are a warm, practical instructional coach. Below is a data summary from an automated analysis of a class recording's transcript (talk-time split, question counts, wait time, redirections, feedback patterns) — not the transcript itself. Write brief, encouraging, specific draft notes a coach could use as a starting point; the coach will read and edit every word. Ground every claim only in the numbers given — never invent a detail that isn't in the summary.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly these three sections and nothing outside them:

<strengths>
1-2 specific strengths suggested by the data.
</strengths>
<growth_areas>
1-2 growth areas suggested by the data — at most two, don't overwhelm.
</growth_areas>
<next_step>
One concrete, small next step to try in the next class period.
</next_step>`

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

  let strengths: string | null = null
  let growthAreas: string | null = null
  let nextStep: string | null = null

  const allowed = await checkAndLogUsage(req.user!.userId, 'audio_session_notes')
  if (allowed) {
    try {
      const summary = `Teacher talk time: ${analysis.teacherTalkPct ?? 'n/a'}%. Student talk time: ${analysis.studentTalkPct ?? 'n/a'}%.
Total questions: ${analysis.questionCount} (${analysis.higherOrderPct ?? 'n/a'}% higher-order).
Follow-up/probing questions: ${analysis.metricsDetail.followUpQuestionCount}.
Average wait time after a question: ${analysis.avgWaitTimeSec ?? 'n/a'} seconds.
Checks for understanding detected: ${analysis.cfuCount}.
Longest uninterrupted teacher monologue: ${analysis.metricsDetail.longestTeacherMonologueSec} seconds.
Distinct student voice segments: ${analysis.metricsDetail.studentVoiceSegments}.
Redirection/behavior language flagged: ${analysis.metricsDetail.redirectionCount} times.
Positive-to-corrective phrase ratio: ${analysis.metricsDetail.positiveToCorrectiveRatio ?? 'n/a'}.
Generic vs. specific feedback after student responses: ${analysis.metricsDetail.genericFeedbackCount} generic, ${analysis.metricsDetail.specificFeedbackCount} specific.`

      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        system: NOTES_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: summary }],
      })
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')

      strengths = extractTag(text, 'strengths')
      growthAreas = extractTag(text, 'growth_areas')
      nextStep = extractTag(text, 'next_step')
    } catch (error) {
      console.error('[audio-sessions] suggested notes generation failed:', error)
    }
  }

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
      strengths,
      growthAreas,
      nextStep,
    },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })

  res.json(updated)
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
