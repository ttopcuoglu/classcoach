import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { analyzeTranscript, buildContentExhibits, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { enrichClassroomMoves } from '../lib/classroomMoves.ts'
import { enrichLessonContent } from '../lib/lessonObjective.ts'
import { checkFeatureAccess, hasActivePlan, startOfCurrentMonth } from '../lib/billing.ts'
import { cachedSystem, cacheStats } from '../lib/promptCache.ts'
import {
  persistMemoryUpdate,
  buildMemoryContextBlock,
  MEMORY_UPDATE_INSTRUCTION,
  MEMORY_UPDATE_TOKEN_BUFFER,
  shouldWriteMemory,
} from '../lib/coachMemory.ts'
import { streamCoachReply } from '../lib/coachStream.ts'
import { buildExperienceContextBlock } from '../lib/experience.ts'
import { CORE_COACHING_RULES, firstNameOf, TRANSCRIPT_RELIABILITY_NOTICE } from '../lib/coachPersona.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { transcribeAudioFile } from '../lib/deepgram.ts'
import { unlink } from 'node:fs/promises'
import { extractTag, stripTag } from '../lib/extractTag.ts'
import { prisma } from '../lib/prisma.ts'
import {
  buildRubricEvidence,
  buildRubricLensSystemPrompt,
  DEFAULT_RUBRIC_FRAMEWORK,
  parseRubricLens,
  RUBRIC_FRAMEWORKS,
  type RubricLensResult,
} from '../lib/rubricLens.ts'
import {
  buildHardLookEvidence,
  buildHardLookSystemPrompt,
  HARD_LOOK_SECTIONS,
  parseHardLook,
  sectionEligibility,
  unaccountedSections,
  type HardLookResult,
} from '../lib/hardLook.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { checkAndLogUsage } from '../lib/usageLimit.ts'

export const audioSessionsRouter = Router()

// Audio only ever lives in memory long enough to reach Deepgram — never on
// disk, never attached to the session row.
// Disk, not memory. A 90-minute 16 kHz PCM recording is ~173 MB, and
// memoryStorage made that 173 MB of Node heap for the length of the upload —
// enough to take the instance down with two teachers stopping at once.
//
// The file is a scratch copy on the way to Deepgram and nothing else: it is
// deleted as soon as transcription finishes or fails, on every path out of the
// route. Nothing writes it to a permanent location, logs it, or attaches it to
// a row — "audio is never saved" stays true.
const upload = multer({ storage: multer.diskStorage({}), limits: { fileSize: 200 * 1024 * 1024 } })

/// Best-effort: a scratch file that outlives its request is a privacy problem,
/// but a failed unlink must never turn a finished transcription into an error.
async function discardUpload(filePath: string | undefined) {
  if (!filePath) return
  try {
    await unlink(filePath)
  } catch (error) {
    console.error('[audio-sessions] could not remove uploaded audio:', error)
  }
}

const STATUSES = ['setup', 'recording', 'paused', 'transcribing', 'tagging', 'analyzing', 'analyzed', 'locked']

const REFLECT_SUMMARY_SYSTEM_PROMPT = `You are a warm, practical instructional coach. Below is the transcript of a reflective conversation you just had with a teacher about their own class recording. Summarize it into brief, specific draft notes the teacher can edit — ground every claim only in what was actually said in the conversation, never invent a detail that wasn't discussed.

Write in plain text only — no markdown (no **bold**, no # headings).

Respond with exactly these three sections and nothing outside them:

<noticed>
1-2 specific things the teacher noticed or that came up as going well in the conversation.
</noticed>
<want_to_explore>
1-2 things the teacher wants to explore or work on — at most two, don't overwhelm.
</want_to_explore>
<next_step>
One concrete, small next step the teacher landed on or that fits what they said.
</next_step>
${CORE_COACHING_RULES}`

const REFLECT_TURN_CAP = 12
const REFLECT_START_MESSAGE = 'Start our reflection conversation.'

// A specialist's read is strengths first, then where the content could go
// further — the old labels (Clarity, Vocabulary, Engagement) described what a
// note was about rather than whether it was working, so a teacher couldn't
// tell praise from a suggestion without reading every word.
const CONTENT_NOTE_LABELS = new Set(['What worked', 'Where it could go further', 'Worth double-checking'])
/// Up to this many "ways into this topic from the world students live in"
/// ideas. Suggestions for next time, never a claim the lesson lacked them.
const MAX_CONNECTION_IDEAS = 3
/// Up to this many "what trips students up in this topic" lines. Subject
/// knowledge, not a reading of the lesson, and labelled that way wherever
/// it's shown.
const MAX_MISCONCEPTIONS = 3
const MIN_CONTENT_EXHIBITS = 3
const NOT_ENOUGH_CONTENT_ERROR = 'This recording caught too little of what you said to write content notes.'

type ContentNote = { id: string; label: string; text: string; timestampSec: number; excerpt: string }

/// `subject` and `topic` come from reading the transcript, and either can be
/// missing — notes are written either way. Withholding them whenever the
/// subject was unknown meant a lesson on moon phases got nothing, because the
/// old keyword scan knew "photosynthesis" and "ecosystem" but not the moon.
export function buildContentNotesSystemPrompt(
  subject: string | null,
  topic: string | null,
  exhibits: { text: string; timestampSec: number }[],
  durationSec: number,
): string {
  const subjectLabel = subject ? `${subject.replace('_', ' ')} ` : ''
  const topicLine = topic
    ? `\n\nWhat this lesson covered, read from the same transcript: ${topic}\n\nYour notes are about THIS content. Name the specific idea, term, example, or model the teacher used — a note that would fit any lesson on any topic is not worth writing.`
    : '\n\nEvery note must be about the specific content in the excerpts below — the actual idea, term, or example the teacher used, never generic teaching advice that would fit any lesson.'
  const shortRecordingNotice =
    durationSec > 0 && durationSec < 180
      ? `\n\nThis excerpt is quite short, and automatic transcription can occasionally mishear a word as another that sounds similar (e.g. mishearing one technical term for another that sounds alike). Given the length here, keep every note more tentative than usual, and if a specific term or claim seems slightly inconsistent with the rest of the excerpt, treat that as a possible mishearing worth a gentle double-check rather than building a note on it with confidence.`
      : ''
  return `You are a supportive ${subjectLabel}content-area specialist reviewing a brief excerpt from a classroom.${topicLine} Your tone is warm, collegial, and constructive — like a helpful colleague, never a critic. Assume good intent and strong subject knowledge on the teacher's part.

You are working from a short audio transcript excerpt only. You have not seen the full lesson, materials, board work, or planning documents, and audio transcription may contain errors. Do not state or imply factual corrections with confidence — frame anything content-related as a question, a suggestion to double-check, or an observation, never as an assertion that something is wrong.${shortRecordingNotice}

Focus on how this particular content was taught: the explanation, the representation or model used, the examples, the vocabulary, the sequence, and what the next layer of depth would be. Judge it as a specialist in this topic would — someone who knows where students usually get stuck in it and what tends to work. Avoid commenting on strict factual accuracy unless a claim is unambiguous and verifiably incorrect independent of context — and even then, phrase it as a gentle check, not a correction.

Never invent or assume standards, curriculum, or grade-level expectations not evident in the transcript.

Below are numbered excerpts from the transcript, each an exact quote. Write 4 to 6 notes, each grounded in exactly one excerpt below — reference it only by its number, never quote or restate the excerpt text yourself. At least two should be "What worked" and at least two "Where it could go further", so the teacher gets both. Use "Worth double-checking" only if something genuinely warrants it.

A "What worked" note names the content move that was effective and why it works for this topic — not just that it was good. A "Where it could go further" note names one concrete, specific thing to try: a representation, a question to ask, an order to put two ideas in, a distinction to draw. It is a suggestion for next time, never a verdict on the teacher. Two sentences at most each.

${exhibits.map((e, i) => `[${i + 1}] ${e.text}`).join('\n')}

Write in plain text only — no markdown.

Then, separately from the notes, write up to ${MAX_MISCONCEPTIONS} lines on what commonly trips students up in THIS topic and the move that heads it off. This part is your subject knowledge, not a reading of this lesson — write it even if the teacher already handled it, and never imply they didn't. One sentence each, concrete and specific to the topic.

Respond with the note block below repeated 4 to 6 times, then one misconceptions block, and nothing else:
<note>
<label>one of: What worked, Where it could go further, Worth double-checking</label>
<exhibit>the excerpt number this note is grounded in</exhibit>
<text>1-2 sentences of warm, constructive feedback</text>
</note>

<misconceptions>
one sentence per line, or NONE
</misconceptions>

Reserve "Worth double-checking" strictly for a concrete, plainly-stated factual claim — never for opinions, interpretations, or open-ended discussion — and always phrase it as a question, e.g. "Worth double-checking: ... — was that the intended framing?" Use it rarely, and only include it at all if something genuinely fits.
${CORE_COACHING_RULES}`
}

/// Subject knowledge about the topic, kept apart from the notes so it can be
/// shown as exactly that rather than as a finding about the lesson.
function parseMisconceptions(text: string): string[] {
  return parseLines(text, 'misconceptions', MAX_MISCONCEPTIONS)
}

function parseLines(text: string, tag: string, max: number): string[] {
  const block = extractTag(text, tag)
  if (!block || block.toUpperCase().includes('NONE')) return []
  return block
    .split('\n')
    .map((line) => line.replace(/^[-•*\d.\s]+/, '').trim())
    .filter((line) => line.length > 20)
    // A reply that ran into the token ceiling ends mid-sentence; half a
    // misconception is worse than one fewer.
    .filter((line) => /[.!?]$/.test(line))
    .slice(0, max)
}

export function parseContentNotes(text: string, exhibits: { text: string; timestampSec: number }[]): ContentNote[] {
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
    if (notes.length >= 6) break
  }
  return notes
}

type ReflectMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

// Returned in two halves so the one that is identical for every teacher can sit
// behind a cache breakpoint — see lib/promptCache.ts. The teacher's name used to
// open this prompt, which made the whole of it per-teacher and so uncacheable;
// it now introduces the session facts instead, next to the other things that are
// true only of this conversation.
//
// CORE_COACHING_RULES stays at the very END, after the session facts, and must
// not be hoisted into `stable` to make that half longer: `context` arrives from
// the client, and the instruction-priority and privacy notices are deliberately
// the last thing Coach reads.
export function buildReflectSystemPrompt(
  context: string[],
  teacherName: string | null,
  spoken = false,
  isStart = false,
): { stable: string; volatile: string } {
  const nameLine = teacherName
    ? `The teacher's name is ${teacherName} — use it naturally now and then, the way a warm colleague would in conversation, never in every single reply and never forced.\n\n`
    : ''
  // Coach speaks first here, so the first thing a teacher hears should sound
  // like a colleague turning to them rather than a report being read out.
  const greetingLine = isStart
    ? `${teacherName ? `Open by greeting ${teacherName} by name. ` : 'Open with a warm hello. '}This is the first thing you say and the teacher has not spoken yet, so start warm and human: acknowledge that they have just finished teaching this lesson, then ask one genuine, open question to begin. Do not lead with a number.\n\n`
    : ''
  const stable = `You are Coach — warm, friendly, funny, and genuinely encouraging, having a short, real-time reflective conversation with a teacher right after their own class recording was analyzed.

This is not a written report — it's a live, back-and-forth chat, so talk like a real person: keep every
reply short and to the point (1-3 sentences, no filler or throat-clearing), grounded only in the facts
below and in what the teacher has said so far. Never invent a detail — a number, a quote, a moment —
that isn't given to you.
${
    spoken
      ? `
THE TEACHER IS LISTENING, NOT READING. They may be driving home. This changes how you talk:

- Two sentences at most, and often one. Say the thing and stop.
- Exactly one question, at the very end, so it is the last thing they hear. Never ask two.
- No lists, no "first... second...", nothing that needs to be seen to be followed.
- One idea per turn. If you have a second thought, hold it — they can ask.
- Say numbers and times the way a person speaks them: "about twelve minutes in", not "12:40";
  "roughly a tenth of your questions", not "9.3%".
- No parenthetical asides and no stacked hedges. One honest qualifier is enough; three is unlistenable.
- Leave silence to think in. A short reply is a kindness here, not a lack of effort.
`
      : ''
  }

Bring real warmth. Teaching is hard — this conversation should leave the teacher feeling a little lighter
and more hopeful about their own practice, not scrutinized. Be encouraging and supportive by default. A
light touch of humor is welcome where it genuinely fits (a dry aside, a playful observation about the
chaos of a classroom) — never at the teacher's expense, and never forced into a reply where it doesn't
belong; a straight, warm reply beats a joke that doesn't land.

Sound like a person talking, not a report being read out. Often, but not every time, start with a brief, genuine reaction to what they just said — a few words at most, then straight to the substance. Reach for whichever kind actually fits:
- just taking it in: "Mm-hmm." "I see." "Yeah." "Right." "Got it."
- feeling it with them: "Oof." "Ugh, that's rough." "Yeah, that's frustrating."
- genuinely pleased: "Oh, nice!" "Okay, that's a win."
- landing on something together: "Yeah, exactly." "Right, that tracks."
- easing into the idea: "Okay, so..." "Honestly..." "Here's a thought."
Better than any stock phrase is a reaction to the specific thing they said, in their own words — "Third period again, huh." "Twenty minutes on one slide? Oof." Use one of those when you can. Generic warm-ups ("That's a great question", "I hear you") are not reactions; they are padding, and they don't count toward your sentence limit either way. Contractions and everyday phrasing throughout, and let punctuation carry the rhythm.

You're in Reflect mode: help the teacher notice and interpret what happened, don't prescribe a fix, and
end with one genuine, open question. When you offer an interpretation rather than a plain fact, label it
as one — "One possibility is...", "This may suggest...", "This coincided with..." — rather than stating
it as settled. Don't say one moment caused another unless the facts below clearly show that.

Don't withhold help a teacher is plainly asking for. If a teacher clearly and directly asks you for a
concrete suggestion or option more than once — not just musing out loud, but actually asking — go ahead
and offer one specific, concrete idea, framed as something to consider rather than an instruction. Redirecting
back to "let's reflect" a second time after a direct ask reads as stonewalling, not coaching.

Ask one open, specific question at a time rather than several. Build on what the teacher just said
instead of listing unrelated observations. Coach, don't grade — there's no right answer you're steering
them toward.

When the teacher moves to a different topic or metric, answer about that topic and name it — never reply
"same answer as before" or repeat an earlier answer about a different topic. If the data doesn't cover the
new topic either, say so for that topic specifically.

When you reference a specific moment from the context below, name its timestamp explicitly (e.g.,
"around 12:40") rather than describing it vaguely.

Write in plain text only — no markdown (no **bold**, no # headings, no bullet lists).`

  const volatile = `

${greetingLine}${nameLine}Here is what's known about this session, and safe to reference (only measured or confidently-zero data —
nothing here is a guess):
${context.map((line) => `- ${line}`).join('\n')}

If the teacher asks about something not covered above, say plainly that the data doesn't cover it rather
than guessing.
${TRANSCRIPT_RELIABILITY_NOTICE}
${CORE_COACHING_RULES}`

  return { stable, volatile }
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

  const access = await checkFeatureAccess(req.user!.userId, 'lesson_debrief', () =>
    prisma.audioSession.count({ where: { userId: req.user!.userId, createdAt: { gte: startOfCurrentMonth() } } }),
  )
  if (!access.allowed) {
    res.status(403).json({ error: access.upgradeMessage })
    return
  }

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

/// The speaker cards the tagging screen needs, derived from stored segments.
///
/// Every distinct raw speaker tag that has at least one segment gets a card,
/// even if none of its utterances happened to have non-blank text — skipping a
/// tag entirely here used to mean a session could reach TagSpeakersPanel with
/// zero speaker cards and no way forward, even though diarization genuinely
/// found distinct voices.
/// How each diarized voice is shown on the "which voice is the teacher?"
/// screen. The sample is that voice's LONGEST utterance, not its first: a
/// first utterance is often a one-word "Okay" that could belong to anyone.
/// totalSec/utteranceCount travel with it because how much a voice spoke is
/// the strongest clue of all — a teacher tagged the 35-second voice instead
/// of the 7-minute one and got a report with the two shares swapped.
function speakerSamplesFrom(segments: { rawSpeakerTag: string; text: string; startSec: number; endSec: number }[]) {
  const byTag = new Map<string, { sample: string; totalSec: number; utteranceCount: number }>()
  for (const segment of segments) {
    const entry = byTag.get(segment.rawSpeakerTag) ?? { sample: '', totalSec: 0, utteranceCount: 0 }
    const text = segment.text.trim()
    if (text.length > entry.sample.length) entry.sample = text
    entry.totalSec += Math.max(0, segment.endSec - segment.startSec)
    entry.utteranceCount++
    byTag.set(segment.rawSpeakerTag, entry)
  }
  return Array.from(byTag.entries())
    .map(([rawSpeakerTag, e]) => ({
      rawSpeakerTag,
      sample: e.sample || '(no clear words captured)',
      totalSec: Math.round(e.totalSec),
      utteranceCount: e.utteranceCount,
    }))
    // Most talk first: the teacher is usually at the top, and the clients
    // preselect that first card.
    .sort((a, b) => b.totalSec - a.totalSec)
}

/// Deepgram, then segments, then `tagging`. Roughly 0.15x the recording's
/// length, which is eight minutes for a fifty-minute class — far too long to
/// hold an HTTP request open, so in async mode this runs detached and the
/// client polls the row instead.
///
/// `audioBuffer` is never written to disk, logged, or attached to the row,
/// here or in async mode: it lives in memory for exactly as long as the
/// Deepgram call and is then unreferenced. Moving when the response is sent
/// did not move where the audio goes.
async function runTranscription(sessionId: string, audioPath: string, mimetype: string) {
  const utterances = await transcribeAudioFile(audioPath, mimetype)
  if (utterances.length === 0) {
    const error = new Error('No speech was detected in this recording.')
    ;(error as Error & { code?: string }).code = 'NO_SPEECH'
    throw error
  }

  const segments = await prisma.$transaction(
    utterances.map((u) =>
      prisma.transcriptSegment.create({
        data: {
          sessionId,
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
    where: { id: sessionId },
    data: { status: 'tagging', durationSec, failureReason: null },
  })
  return speakerSamplesFrom(segments)
}

/// A job that ended badly has to leave the row in a state the teacher can act
/// on. Silence would leave "Processing" spinning forever, which is worse than
/// the eight-minute wait this replaced.
/// Removes a session that turned out to hold nothing. Never throws: this runs
/// inside a detached `.catch`, where an error has nowhere left to go.
async function deleteSessionQuietly(sessionId: string) {
  try {
    await prisma.audioSession.delete({ where: { id: sessionId } })
  } catch (error) {
    console.error('[audio-sessions] could not remove an empty session:', error)
  }
}

async function markTranscriptionFailed(sessionId: string, message: string) {
  try {
    await prisma.audioSession.update({
      where: { id: sessionId },
      data: { status: 'failed', failureReason: message },
    })
  } catch (error) {
    console.error('[audio-sessions] could not record transcription failure:', error)
  }
}

/// A background transcription lives in this process, so a restart — every
/// deploy is one — kills it and leaves the row saying "Processing" with
/// nothing behind it. Called once at boot: anything still transcribing is by
/// definition orphaned, because a job that survived would have finished or
/// failed inside its own request.
///
/// The cutoff is a safety margin for the rare case where two instances
/// overlap during a rolling restart; a genuinely running job younger than
/// this is left alone.
const ORPHANED_TRANSCRIPTION_MINUTES = 30

/// An analysis is minutes of model time at the outside, so a row still
/// "analyzing" long after that lost its process — a restart, or a crash. The
/// speakers are already tagged, so it goes back to `tagging`, where the
/// teacher's Analyze button is.
const ORPHANED_ANALYSIS_MINUTES = 20

export async function failOrphanedAnalyses() {
  const cutoff = new Date(Date.now() - ORPHANED_ANALYSIS_MINUTES * 60 * 1000)
  try {
    const { count } = await prisma.audioSession.updateMany({
      where: { status: 'analyzing', updatedAt: { lt: cutoff } },
      data: { status: 'tagging', failureReason: 'The analysis did not finish. Please try again.' },
    })
    if (count > 0) console.log(`[audio-sessions] released ${count} interrupted analysis(es)`)
  } catch (error) {
    console.error('[audio-sessions] could not sweep interrupted analyses:', error)
  }
}

export async function failOrphanedTranscriptions() {
  const cutoff = new Date(Date.now() - ORPHANED_TRANSCRIPTION_MINUTES * 60 * 1000)
  try {
    const { count } = await prisma.audioSession.updateMany({
      where: {
        status: 'transcribing',
        OR: [{ transcribeStartedAt: { lt: cutoff } }, { transcribeStartedAt: null }],
      },
      data: {
        status: 'failed',
        // Not "record again": since the phone keeps its copy until a session
        // has a transcript, an interrupted job is usually retryable from the
        // device that made it.
        failureReason: 'Transcription was interrupted. If you recorded this on your phone, open Lesson Debrief there to send it again.',
      },
    })
    if (count > 0) console.log(`[audio-sessions] released ${count} interrupted transcription(s)`)
  } catch (error) {
    console.error('[audio-sessions] could not sweep interrupted transcriptions:', error)
  }
}

audioSessionsRouter.get('/:id/speakers', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: { id: true },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  const segments = await prisma.transcriptSegment.findMany({
    where: { sessionId: session.id },
    orderBy: { startSec: 'asc' },
    select: { rawSpeakerTag: true, text: true, startSec: true, endSec: true },
  })
  res.json({ speakers: speakerSamplesFrom(segments) })
})

audioSessionsRouter.post('/:id/transcribe', upload.single('audio'), async (req, res) => {
  const sessionId = req.params.id as string
  const session = await prisma.audioSession.findFirst({
    where: { id: sessionId, userId: req.user!.userId },
  })
  if (!session) {
    // The upload is already on disk by the time this runs, so it has to go
    // even though nothing will read it.
    await discardUpload(req.file?.path)
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (!req.file) {
    res.status(400).json({ error: 'No audio file received' })
    return
  }
  const audioPath = req.file.path

  // Clients that don't ask for async get the original behaviour: one request
  // that returns the speaker cards. Builds already in teachers' hands depend
  // on that, so the synchronous path stays until they are gone.
  if (req.body?.mode === 'async') {
    const recordedSec = Number(req.body?.durationSec)
    const { mimetype } = req.file
    await prisma.audioSession.update({
      where: { id: sessionId },
      data: {
        status: 'transcribing',
        transcribeStartedAt: new Date(),
        failureReason: null,
        // The client knows how long it recorded; storing it now is what lets
        // any other device draw a progress estimate for this job.
        ...(Number.isFinite(recordedSec) && recordedSec > 0 ? { durationSec: Math.round(recordedSec) } : {}),
      },
    })
    res.status(202).json({ status: 'transcribing' })

    void runTranscription(sessionId, audioPath, mimetype)
      .catch(async (error) => {
        console.error('[audio-sessions] background transcription failed:', error)
        const noSpeech = (error as Error & { code?: string }).code === 'NO_SPEECH'
        if (noSpeech) {
          // Nothing was captured, so there is nothing to keep: no transcript,
          // and the audio is discarded either way. Leaving the row behind only
          // put a "Couldn't process" entry in Past sessions that the teacher
          // has to tidy up by hand. The client watching the transcription is
          // the one that tells them what happened — it sees this session stop
          // existing and says so.
          await deleteSessionQuietly(sessionId)
          return
        }
        await markTranscriptionFailed(sessionId, 'Transcription failed. Please try again.')
      })
      // Whether it worked or not, the scratch copy goes.
      .finally(() => discardUpload(audioPath))
    return
  }

  try {
    const utterances = await transcribeAudioFile(audioPath, req.file.mimetype)

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

    res.json({ speakers: speakerSamplesFrom(segments) })
  } catch (error) {
    const failure = classifyModelError(error, 'Transcription failed')
    logModelFailure('[audio-sessions] transcription failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  } finally {
    // The scratch copy is gone before this request is, on every path.
    await discardUpload(audioPath)
  }
})

audioSessionsRouter.post('/:id/tag-speaker', async (req, res) => {
  // Diarization often splits one teacher into two voices (walking the room,
  // projecting vs. conversational), so more than one raw tag can be the
  // teacher. `rawSpeakerTag` (a single string) is still accepted for iOS
  // builds that predate multi-select.
  const { rawSpeakerTags, rawSpeakerTag } = req.body ?? {}
  const requested: unknown[] = Array.isArray(rawSpeakerTags) ? rawSpeakerTags : [rawSpeakerTag]
  const teacherTags = Array.from(
    new Set(requested.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)),
  )
  if (teacherTags.length === 0) {
    res.status(400).json({ error: 'Pick at least one teacher voice.' })
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

  // Re-tagging an already-analyzed session is allowed — a wrong tag used to
  // be permanent, leaving a report with teacher and student talk swapped and
  // no way back except deleting the recording. A locked report is final.
  if (session.status === 'locked') {
    res.status(403).json({ error: 'This report is locked and can no longer be edited.' })
    return
  }

  const knownTags = new Set(session.segments.map((s) => s.rawSpeakerTag))
  if (teacherTags.some((t) => !knownTags.has(t))) {
    res.status(400).json({ error: 'Unknown speaker for this session.' })
    return
  }

  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { in: teacherTags } },
    data: { speakerLabel: 'Teacher' },
  })
  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { notIn: teacherTags } },
    data: { speakerLabel: 'Student' },
  })

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({
      where: { sessionId: session.id },
      orderBy: { startSec: 'asc' },
    })
  ).map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text }))

  // Clients that poll say so. The ones that don't are builds already in
  // teachers' hands, which wait on the request exactly as they always have.
  if (req.body?.mode === 'async') {
    await prisma.audioSession.update({
      where: { id: session.id },
      data: { status: 'analyzing', failureReason: null },
    })
    res.status(202).json({ status: 'analyzing' })

    void runAnalysis(session.id, req.user!.userId, segments).catch(async (error) => {
      console.error('[audio-sessions] background analysis failed:', error)
      // The transcript is safe and the speakers stay tagged, so this is
      // retryable from the report: pressing Analyze again re-runs the reads.
      await prisma.audioSession
        .update({
          where: { id: session.id },
          data: { status: 'tagging', failureReason: 'The analysis did not finish. Please try again.' },
        })
        .catch(() => {})
    })
    return
  }

  const updated = await runAnalysis(session.id, req.user!.userId, segments)

  res.json(updated)
})

/// The analysis itself: two reads of the transcript, the row, then the prose.
/// Runs inside the request for clients that wait on it, and detached for the
/// ones that poll — a 60-minute class is minutes of model time, which is
/// longer than any phone will hold a request open.
async function runAnalysis(sessionId: string, userId: string, segments: Segment[]) {
  // The phrase scan first, then Claude reads the transcript and overrides it —
  // both reads at once, since a teacher is waiting on this. Best-effort by
  // design: if either call fails the phrase answer stands, so a transcript is
  // never lost to them.
  const scanned = analyzeTranscript(segments)
  const [analysis, lessonContent] = await Promise.all([
    enrichClassroomMoves(scanned, segments),
    enrichLessonContent(detectLessonContent(segments, scanned.phases), segments),
  ])

  // Notes are no longer auto-generated from raw metrics here — they're
  // populated later from the Reflect tab's actual coaching conversation
  // (see reflect-summary below), so the teacher doesn't see two independent
  // AI-written takeaways derived from the same numbers.
  const updated = await prisma.audioSession.update({
    where: { id: sessionId },
    data: {
      status: 'analyzed',
      failureReason: null,
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
      cfuLog: analysis.cfuLog,
      feedbackLog: analysis.feedbackLog,
      directiveLog: analysis.directiveLog,
      toneLog: analysis.toneLog,
      redirectionLog: analysis.redirectionLog,
      lessonContent,
    },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })

  // The report is complete without the prose: it is one 5000-token call, and
  // the Summary tab asks for it when it isn't there yet.
  void writeClassSummary(userId, updated, segments).catch((error) => {
    console.error('[audio-sessions] class summary after analysis failed:', error)
  })

  return updated
}

audioSessionsRouter.post('/:id/reflect-chat', async (req, res) => {
  const { message, context, spoken } = req.body ?? {}
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

  const denied = await checkAndLogUsage(req.user!.userId, 'reflect_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmedMessage = typeof message === 'string' ? message.trim() : ''

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, name: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))
    // Memory is read every turn but rewritten only on some — see shouldWriteMemory.
    // A start turn has no teacher message yet, so it has nothing to remember.
    const writeMemory = memoryOn && shouldWriteMemory(isStart ? 0 : userTurnCount + 1)
    // A session carries a teacher name only when the client sent one, and iOS
    // never did — so a lesson recorded on a phone gave Coach no name to use
    // while the same teacher's web sessions did. The account's own name is the
    // fallback, which also covers every session recorded before this.
    const teacherName = firstNameOf(session.teacherName ?? user?.name)
    const reflectPrompt = buildReflectSystemPrompt(safeContext, teacherName, spoken === true, isStart)

    const messages = [
      ...existing.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: isStart ? REFLECT_START_MESSAGE : trimmedMessage },
    ]

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: writeMemory ? 300 + MEMORY_UPDATE_TOKEN_BUFFER : 300,
      system: cachedSystem(
        reflectPrompt.stable,
        memoryOn
          ? `${reflectPrompt.volatile}${buildExperienceContextBlock(user?.experienceLevel)}${buildMemoryContextBlock(user!.coachMemory)}${writeMemory ? MEMORY_UPDATE_INSTRUCTION : ''}`
          : `${reflectPrompt.volatile}${buildExperienceContextBlock(user?.experienceLevel)}`,
      ),
      messages,
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.reflectChat')
    // cacheRead: 0 here means the stable half stopped caching — most likely a
    // per-teacher detail crept above the breakpoint, or the prompt got shorter
    // than Sonnet 5's 1024-token minimum.
    console.log('[audio-sessions] reflect chat', cacheStats(response.usage))
    const reply = stripTag(text, 'memory_update')

    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

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

    if (writeMemory) {
      await persistMemoryUpdate(req.user!.userId, extractTag(text, 'memory_update'), user!.coachMemory)
    }

    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not reach your coach')
    logModelFailure('[audio-sessions] reflect chat failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// The same conversation, streamed sentence by sentence. The route above stays
// because builds already in teachers' hands call it; this one exists because
// Reflect made the teacher watch a progress ring for the whole reply while
// Talk It Through — the same Coach — has shown words as they were written for
// weeks. See lib/coachStream.ts for the NDJSON framing and for why an
// abandoned turn leaves nothing behind.
//
// Every guard the non-streaming route has runs here too, and all of them
// before streamCoachReply writes the first byte: once the stream has begun
// the status code is already sent and can no longer say 403, 409 or 429.
audioSessionsRouter.post('/:id/reflect-chat/stream', async (req, res) => {
  const gateStart = Date.now()
  const { message, context, spoken } = req.body ?? {}
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

  const denied = await checkAndLogUsage(req.user!.userId, 'reflect_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmedMessage = typeof message === 'string' ? message.trim() : ''
  const isSpoken = spoken === true

  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, name: true, talkVoice: true },
  })
  const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))
  // Memory is read every turn but rewritten only on some — see shouldWriteMemory.
  // A start turn has no teacher message yet, so it has nothing to remember.
  const writeMemory = memoryOn && shouldWriteMemory(isStart ? 0 : userTurnCount + 1)
  // Same fallback as the non-streaming route: iOS never sent a teacher name,
  // so the account's own name stands in.
  const teacherName = firstNameOf(session.teacherName ?? user?.name)
  const reflectPrompt = buildReflectSystemPrompt(safeContext, teacherName, isSpoken, isStart)

  await streamCoachReply(res, 'reflect_chat', {
    gateMs: Date.now() - gateStart,
    // A spoken Reflect turn gets the same sentence-at-a-time synthesis Talk It
    // Through gets, keyed on the teacher's own voice choice — there is one
    // Coach, so it should not sound like two.
    speak: isSpoken ? { voice: user?.talkVoice ?? undefined } : undefined,
    system: cachedSystem(
      reflectPrompt.stable,
      memoryOn
        ? `${reflectPrompt.volatile}${buildExperienceContextBlock(user?.experienceLevel)}${buildMemoryContextBlock(user!.coachMemory)}${writeMemory ? MEMORY_UPDATE_INSTRUCTION : ''}`
        : `${reflectPrompt.volatile}${buildExperienceContextBlock(user?.experienceLevel)}`,
    ),
    maxTokens: writeMemory ? 300 + MEMORY_UPDATE_TOKEN_BUFFER : 300,
    // No word budget, matching the non-streaming route: Reflect's length is
    // set by its prompt, and this reply is read on screen as well as heard.
    messages: [
      ...existing.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: isStart ? REFLECT_START_MESSAGE : trimmedMessage },
    ],
    safetyLabel: 'audioSessions.reflectChat',
    // The saved record is an audio session, not a debrief.
    recordKey: 'session',
    persist: (reply) => {
      // One timestamp for the pair, exactly as the non-streaming route writes
      // it, and the teacher's turn is only stored alongside a reply they
      // actually saw — an abandoned stream never reaches here.
      const now = new Date().toISOString()
      const newTurns: ReflectMessage[] = isStart
        ? [{ role: 'assistant', text: reply, createdAt: now }]
        : [
            { role: 'user', text: trimmedMessage, createdAt: now },
            { role: 'assistant', text: reply, createdAt: now },
          ]
      return prisma.audioSession.update({
        where: { id: session.id },
        data: { reflectConversation: [...existing, ...newTurns] },
      })
    },
    afterPersist: writeMemory
      ? async (rawText) => {
          await persistMemoryUpdate(req.user!.userId, extractTag(rawText, 'memory_update'), user!.coachMemory)
        }
      : undefined,
  })
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

  const denied = await checkAndLogUsage(req.user!.userId, 'audio_session_notes')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const transcript = conversation
      .map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`)
      .join('\n')

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: REFLECT_SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.reflectSummary')

    const strengths = extractTag(text, 'noticed')
    const growthAreas = extractTag(text, 'want_to_explore')
    const nextStep = extractTag(text, 'next_step')
    const allEmpty = !strengths && !growthAreas && !nextStep
    // A response cut off by the token limit before finishing all three
    // sections would otherwise silently save a partial summary (whichever
    // section Claude wrote first, with the rest left blank) — retry instead
    // of accepting it. A normal completion that legitimately only touched
    // on one or two sections is still accepted as-is.
    const truncatedIncomplete = response.stop_reason === 'max_tokens' && (!strengths || !growthAreas || !nextStep)
    if (allEmpty || truncatedIncomplete) {
      res.status(502).json({ error: 'Could not summarize your conversation. Please try again.' })
      return
    }

    res.json({ strengths, growthAreas, nextStep })
  } catch (error) {
    const failure = classifyModelError(error, 'Could not summarize your conversation')
    logModelFailure('[audio-sessions] reflect summary failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
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

  const lessonContent = session.lessonContent as unknown as { subject: string | null; summary?: string | null } | null
  const subject = lessonContent?.subject ?? null
  const topic = lessonContent?.summary ?? null

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

  const denied = await checkAndLogUsage(req.user!.userId, 'content_notes')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2200,
      system: buildContentNotesSystemPrompt(subject, topic, exhibits, session.durationSec ?? 0),
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
      data: {
        contentNotes: {
          subject,
          notes,
          misconceptions: parseMisconceptions(text),
        },
      },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not generate content notes')
    logModelFailure('[audio-sessions] content notes failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// Rubric Lens stays silent below this many citable moments — a lens built
// on two quotes would read like a verdict about everything it couldn't hear.
const MIN_RUBRIC_EVIDENCE_ITEMS = 4
const NOT_ENOUGH_RUBRIC_EVIDENCE_ERROR =
  "This recording didn't capture enough teaching moments to see it through a rubric. A longer recording usually does."

audioSessionsRouter.post('/:id/rubric-lens', async (req, res) => {
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
  // Generated once and kept, like Content Notes — a second tap returns the
  // same lens rather than a second, differently-worded one.
  if (session.rubricLens) {
    res.json(await prisma.audioSession.findFirst({
      where: { id: session.id },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    }))
    return
  }

  const framework = RUBRIC_FRAMEWORKS[DEFAULT_RUBRIC_FRAMEWORK]
  const evidence = buildRubricEvidence({
    ...session,
    segments: session.segments.map((s) => ({
      speakerLabel: s.speakerLabel,
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
    })),
  })
  if (evidence.items.length < MIN_RUBRIC_EVIDENCE_ITEMS) {
    res.status(400).json({ error: NOT_ENOUGH_RUBRIC_EVIDENCE_ERROR })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'rubric_lens')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: buildRubricLensSystemPrompt(
        framework,
        evidence,
        `${CORE_COACHING_RULES}\n${TRANSCRIPT_RELIABILITY_NOTICE}`,
      ),
      messages: [{ role: 'user', content: 'Write the rubric lens now.' }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'audioSessions.rubricLens')

    const components = parseRubricLens(text, framework, evidence.items)
    // Most of the framework has to come back — a lens missing half its
    // components would look like those parts of teaching were absent.
    if (components.length < Math.ceil(framework.components.length * 0.75)) {
      res.status(502).json({ error: 'Could not build the rubric lens. Please try again.' })
      return
    }

    const rubricLens: RubricLensResult = {
      framework: framework.id,
      frameworkName: framework.name,
      generatedAt: new Date().toISOString(),
      components,
      notObservable: framework.notObservable,
    }
    const updated = await prisma.audioSession.update({
      where: { id: session.id },
      data: { rubricLens },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not build the rubric lens')
    logModelFailure('[audio-sessions] rubric lens failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// The Hard Look holds itself to a stricter bar than Rubric Lens, which
// organises evidence and can afford to be thin. This one makes a case against
// a lesson, and a case made on two quotes is an opinion with a quote stapled
// to it. Twice the floor, and a hard refusal on short recordings: criticising
// a teacher on a ten-minute snapshot of a lesson is not demanding, it is
// unfair, and unfair is the one thing that would make a teacher stop
// believing the rest of the report.
const MIN_HARD_LOOK_EVIDENCE_ITEMS = 8
const HARD_LOOK_SHORT_SESSION_SEC = 10 * 60
const NOT_ENOUGH_HARD_LOOK_EVIDENCE_ERROR =
  "There isn't enough in this recording to be fair about. A hard look needs a fuller lesson than this one captured — otherwise it would just be guessing at you."

audioSessionsRouter.post('/:id/hard-look', async (req, res) => {
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
  // Written once and kept, like Rubric Lens and Content Notes. It matters
  // more here than there: a teacher who could re-roll a hard look until it
  // said something kinder (or harsher) would be reading a slot machine, not
  // a reading of their lesson.
  if (session.hardLook) {
    res.json(await prisma.audioSession.findFirst({
      where: { id: session.id },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    }))
    return
  }
  if ((session.durationSec ?? 0) < HARD_LOOK_SHORT_SESSION_SEC) {
    res.status(400).json({ error: NOT_ENOUGH_HARD_LOOK_EVIDENCE_ERROR })
    return
  }

  // The same evidence Rubric Lens reads, on purpose — see lib/hardLook.ts.
  // A harsher voice over a wider net would be a different feature, and a
  // worse one.
  const evidence = buildHardLookEvidence({
    ...session,
    segments: session.segments.map((s) => ({
      speakerLabel: s.speakerLabel,
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
    })),
  })
  if (evidence.items.length < MIN_HARD_LOOK_EVIDENCE_ITEMS) {
    res.status(400).json({ error: NOT_ENOUGH_HARD_LOOK_EVIDENCE_ERROR })
    return
  }

  // Which sections the evidence can actually carry a criticism about. The rest
  // never reach the model — see `sectionEligibility` for what happened when
  // they did. With none left there is nothing to ask, and saying so beats
  // spending a call to be told the same.
  const { eligible, withheld } = sectionEligibility(session)
  if (eligible.length === 0) {
    res.status(400).json({ error: NOT_ENOUGH_HARD_LOOK_EVIDENCE_ERROR })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'hard_look')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const system = buildHardLookSystemPrompt(
    evidence,
    eligible,
    `${CORE_COACHING_RULES}\n${TRANSCRIPT_RELIABILITY_NOTICE}`,
  )

  try {
    // A section the model skipped is not a section with nothing wrong in it.
    // Showing it as clear would be a false all-clear — the same invention
    // this feature is built to avoid, pointing the other way. Gating the
    // sections first made this rare rather than routine, but one lesson in six
    // still dropped one, so it gets the same single retry classroomMoves gives
    // an empty read before giving up.
    let parsed: ReturnType<typeof parseHardLook> | null = null
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2500,
        // Same reason as classroomMoves' and lessonObjective's: adaptive
        // thinking draws from this budget, and left on it spent all 2500
        // tokens here and returned a reply with no text blocks in it at all.
        thinking: { type: 'disabled' },
        system,
        messages: [{ role: 'user', content: 'Write the hard look now.' }],
      })
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      flagIfUnsafe(text, 'audioSessions.hardLook')

      const candidate = parseHardLook(text, evidence.items)
      if (unaccountedSections(candidate, eligible).length === 0) {
        parsed = candidate
        break
      }
    }
    if (!parsed) {
      res.status(502).json({ error: 'Could not finish the hard look. Please try again.' })
      return
    }

    const hardLook: HardLookResult = {
      generatedAt: new Date().toISOString(),
      critiques: parsed.critiques,
      // Our own withheld reasons alongside the model's own clears, in the
      // sections' order, so the teacher reads one list of everything that was
      // looked at and not pressed on rather than two kinds of silence.
      cleared: [...parsed.cleared, ...withheld].sort(
        (a, b) =>
          HARD_LOOK_SECTIONS.findIndex((s) => s.key === a.section) -
          HARD_LOOK_SECTIONS.findIndex((s) => s.key === b.section),
      ),
    }
    const updated = await prisma.audioSession.update({
      where: { id: session.id },
      data: { hardLook },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not finish the hard look')
    logModelFailure('[audio-sessions] hard look failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// Deliberately scoped to "what the lesson covered" only — the report's
// own strength claim now lives in its own dedicated section (Summary's
// "A strength to keep"), grounded in a real quote/timestamp rather than
// this prompt's paraphrase. Asking for both here produced two competing,
// sometimes-inconsistent strength claims on the same page.
/// What the recording measured, handed to the summary as evidence it is
/// allowed to cite. Without it the narrative can only describe content; with
/// it, it can say what went well and what might be worth a look — which is
/// what a teacher actually opens the report for.
export type ClassSummaryMetrics = {
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number | null
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  studentVoiceDetected: boolean
  /// The actual moments, so the checks narrative can talk about when they
  /// happened and what was said rather than restating a count the teacher is
  /// already looking at.
  cfuMoments?: { timestampSec: number; text: string }[]
  feedbackMoments?: { kind: string; timestampSec: number; text: string }[]
  /// Climate & Routines is mostly zeros on a normal lesson, because it counts
  /// fixed phrases. The moments that DID register are what a narrative can
  /// speak to honestly.
  directionMoments?: { timestampSec: number; text: string }[]
  toneMoments?: { kind: string; timestampSec: number; text: string }[]
  redirectionMoments?: { timestampSec: number; text: string }[]
  nameMentions?: number | null
  uniqueNames?: number | null
  /// Already read out of the transcript by `lessonObjective.ts`. Handed to
  /// the content note so it can weave them into one expert reading rather
  /// than the section listing each detection on its own.
  statedObjective?: string | null
  lessonSummary?: string | null
  connections?: string[]
  vocabulary?: string[]
  subject?: string | null
}

export function buildClassSummarySystemPrompt(
  exhibits: { text: string; timestampSec: number }[],
  recordedSec: number,
  metrics?: ClassSummaryMetrics,
): string {
  const durationGuidance =
    recordedSec < 120
      ? 'This is a very short clip. Write one plain, honest sentence about what little was captured and stop — there is not enough here to say anything about the teaching.'
      : recordedSec < 600
        ? 'This is a short excerpt, not a full lesson. Keep to two or three sentences, clearly scoped to what is shown below, and avoid sweeping claims.'
        : 'This is a substantial recording. Write three full paragraphs, as described below — aim for 80 to 120 words each. A teacher sat through the whole lesson; two thin lines back is not worth their time. Length must come from evidence, never from padding: if a paragraph genuinely has less to stand on, write it shorter and say why.'

  const measured = metrics
    ? `What the recording measured. You may cite these numbers and no others:
- teacher talk: ${metrics.teacherTalkPct ?? 'not measured'}%
- student talk: ${metrics.studentTalkPct ?? 'not measured'}%${metrics.studentVoiceDetected ? '' : ' (NO student voice was separately detected at all)'}
- questions asked: ${metrics.questionCount ?? 'not measured'}
- of those, recognised as higher-order: ${metrics.higherOrderPct ?? 'not measured'}%
- average wait time after a question: ${metrics.avgWaitTimeSec ?? 'not measured'}s
- check-for-understanding moves heard: ${metrics.cfuCount ?? 'not measured'}`
    : ''

  return `You are a warm, practical instructional coach writing for a teacher about their own recorded lesson. Never invent a specific number, name, or fact that is not evidenced below, and never claim more confidence than what was captured supports.

${durationGuidance}

Structure, when the recording is long enough for three paragraphs:

1. WHAT THE LESSON WAS ABOUT. Plain description of the content and how it was taught: the subject matter, what students were asked to do with it, and how the period moved from one part to the next. Walk through the lesson in order rather than listing topics. No praise, no criticism.

2. WHAT WENT WELL. Name specific things this teacher actually did — a connection they drew, a question they asked, a routine that worked, a moment they gave students room. Several of them, each tied to the moment it came from, not one line of praise. Be concrete and generous. Vague praise is worse than none.

3. WHAT MIGHT BE WORTH A LOOK. Offered as questions for the teacher to weigh, not verdicts. And every one of them must be tied to the single most important caveat: THIS IS A MICROPHONE IN A ROOM. It hears the teacher clearly and students poorly. A student who spoke quietly, from the back, or in a group did not reach it. A low student-talk number may mean the room was quiet, or may mean the recording could not hear it, and you must say so rather than letting the teacher read it as a verdict on their teaching. Never tell a teacher what happened in their room that you could not hear. Where you are unsure, say what the recording could and could not show and let them judge.

If a number is missing or the transcript is too thin to support a paragraph, say so plainly and write less. Writing less is always allowed — but only for want of evidence. Where the transcript does support it, write the full paragraph.

${measured}

Below are numbered excerpts of what the teacher said, in order. Paraphrase only — do not quote them directly or use quotation marks.

${exhibits.map((e, i) => `[${i + 1}] ${e.text}`).join('\n')}

Write in plain text, no markdown, no headings. Separate paragraphs with a blank line. Address the teacher as "you".

Then, separately, write THE CHECKS NOTE: one paragraph for a section of
the report that shows two numbers — how many spoken checks for understanding
were heard, and how often feedback named something specific. The numbers are
already on that screen, so do not restate them. Say what they cannot: WHEN the
checks happened and whether they were spread through the lesson or clustered;
what the teacher's feedback actually did with a student's answer; and, if
there is a long stretch with no check, name it as a question rather than a
fault. Same microphone caveat applies — a check made by looking at faces or
reading over shoulders leaves no trace here, and you must not imply its
absence means it did not happen. If there is too little to say, say one honest
sentence and stop. Otherwise write one paragraph that covers both: what
the checks actually were and when they fell, and what the feedback
did with what students said.

${
    metrics?.cfuMoments?.length
      ? `Checks heard:\n${metrics.cfuMoments.map((m) => `- ${mmss(m.timestampSec)} ${m.text}`).join('\n')}`
      : 'No spoken checks for understanding were detected.'
  }

${
    metrics?.feedbackMoments?.length
      ? `Feedback moments:\n${metrics.feedbackMoments.map((m) => `- ${mmss(m.timestampSec)} (${m.kind}) ${m.text}`).join('\n')}`
      : 'No feedback moments were detected.'
  }

Then THE CLIMATE NOTE: one paragraph for a section about routines,
directions and classroom language, covering both how the class was moved
between activities and how the teacher spoke to students. These moments are
read from the transcript, so they are the teacher's own words rather than
matches against a phrase list — write about what was said and how it worked,
and never explain the detector to the teacher. A zero still means only that
nothing of that kind was heard: encouragement carried by tone, a look that
settles a room, and anything said too quietly for the mic leave no trace. If
there is genuinely nothing to say, one honest sentence is the right answer.

${
    metrics?.directionMoments?.length
      ? `Directions heard:\n${metrics.directionMoments.map((m) => `- ${mmss(m.timestampSec)} ${m.text}`).join('\n')}`
      : 'No directions were heard.'
  }
${
    metrics?.toneMoments?.length
      ? `Tone moments:\n${metrics.toneMoments.map((m) => `- ${mmss(m.timestampSec)} (${m.kind}) ${m.text}`).join('\n')}`
      : 'No positive or corrective moments were heard.'
  }
${
    metrics?.redirectionMoments?.length
      ? `Redirections:\n${metrics.redirectionMoments.map((m) => `- ${mmss(m.timestampSec)} ${m.text}`).join('\n')}`
      : 'No redirections were heard.'
  }
Student names: ${metrics?.nameMentions ?? 'not measured'} mentions across ${metrics?.uniqueNames ?? 'not measured'} names.

Then THE TALK NOTE: one paragraph about who was heard and for how long,
covering both the shape of the teacher's talk and where students got
the floor, and what that does and does not tell us.
The numbers — teacher talk, student talk, silence — are on that screen, so do
not restate them. Say what they cannot: where the long teacher stretches fell
and what they were doing (explaining, setting up, recapping), where students
got the floor, and whether the shape changed across the lesson. The caveat
governs this section more than any other: a room microphone hears the teacher
clearly and students poorly, so a low student number may be a quiet room or a
mic that could not reach it, and a teacher must not read it as a verdict.

Then THE QUESTIONS NOTE: one paragraph about the questioning, covering both
what was asked and what happened after it was asked. Again the
counts are already on screen. Say what kinds of questions these were, whether
they built on each other or moved on, what happened after one was asked, and
whether answers were followed up or accepted. Be honest that the higher-order
figure comes from recognising certain openings — "why do you think", "how
might" — so a question phrased another way is counted as recall even when it
asked for real thinking. Never let that number stand as a judgement of the
teacher's questioning.

Then WAYS INTO THIS TOPIC: up to three real-world connections a teacher could use for THIS topic — the everyday thing, job, story, or phenomenon, and the question that opens it with students. Concrete and specific: "a calendar app's moon icons" beats "something from daily life". These are ideas for next time, so write them even when the teacher already made good connections, and never imply they made none.

Then THE CONTENT NOTE: one warm paragraph opening the Clarity & Content section — what this lesson was about and what the teacher did with the content: the explanation, the model or representation, the examples, the vocabulary, the connections drawn. Lead with what worked; this paragraph opens the section, it does not grade it. Name the actual ideas and terms, never "the content" in the abstract.

Respond with exactly these six blocks and nothing else. The summary block
holds all three paragraphs described above, separated by blank lines — one
paragraph back is a failure, not a concise answer:
<class_summary>
First paragraph: what the lesson was about.

Second paragraph: what went well, specifically.

Third paragraph: what might be worth a look, with the microphone caveat.
</class_summary>
<checks_note>
Your checks note.
</checks_note>
<climate_note>
Your climate note.
</climate_note>
<talk_note>
Your talk note.
</talk_note>
<questions_note>
Your questions note.
</questions_note>
<content_note>
Your content note.
</content_note>
<connection_ideas>
one connection per line, or NONE
</connection_ideas>
${CORE_COACHING_RULES}
${TRANSCRIPT_RELIABILITY_NOTICE}`
}

function lessonContentField(content: unknown, key: string, nested?: string): string | null {
  const value = (content as Record<string, unknown> | null)?.[key]
  const resolved = nested ? (value as Record<string, unknown> | null)?.[nested] : value
  return typeof resolved === 'string' && resolved.trim() ? resolved : null
}

function lessonContentQuotes(content: unknown, key: string): string[] {
  const value = (content as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (v as { quote?: unknown })?.quote)
    .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
}

function metricNumber(detail: unknown, key: string): number | null {
  const value = (detail as Record<string, unknown> | null)?.[key]
  return typeof value === 'number' ? value : null
}

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/// Every client splits these narratives into paragraphs on a blank line, so a
/// model that separated its paragraphs with a single newline instead was
/// read as one unbroken wall of text — three paragraphs written, one
/// paragraph shown. Any run of newlines becomes exactly one blank line.
export function normalizeParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n')
}

/// Thrown by `writeClassSummary` when the teacher is over their monthly
/// limit, so the route can answer 429 rather than a generic failure.
class UsageLimitError extends Error {}

/// Writes the lesson summary and the four Insights narratives for one
/// session, and hands back the updated row.
///
/// Shared, because for a long time only the website asked for this: the
/// summary was generated the first time someone opened the Summary tab on
/// web, and the iOS app never asked at all. The same lesson therefore read
/// differently in the two places — whoever opened the website got the
/// written summary, and the phone fell back to a line assembled from the raw
/// numbers. It is written once, with the rest of the report, and both clients
/// now read the same words.
///
/// Returns null when there is nothing to write (over the usage limit, or the
/// model gave back no summary), so a caller that already has a report can
/// keep it rather than lose it to this.
async function writeClassSummary(
  userId: string,
  session: {
    id: string
    durationSec: number | null
    teacherTalkPct: number | null
    studentTalkPct: number | null
    questionCount: number | null
    higherOrderPct: number | null
    avgWaitTimeSec: number | null
    cfuCount: number | null
    cfuLog: unknown
    feedbackLog: unknown
    directiveLog: unknown
    toneLog: unknown
    redirectionLog: unknown
    metricsDetail: unknown
    lessonContent: unknown
  },
  segments: Segment[],
) {
  const exhibits = buildContentExhibits(segments)

  // Genuinely nothing to summarize — say so plainly, no Claude call, and
  // cache that answer so this session never re-attempts. This is the
  // literal "don't sugarcoat" case: a recording too brief or too unclear
  // to summarize gets told that, not a manufactured paragraph.
  if (exhibits.length === 0) {
    return prisma.audioSession.update({
      where: { id: session.id },
      data: { classSummary: "This recording didn't capture enough clear speech to summarize what the class covered." },
      include: { segments: { orderBy: { startSec: 'asc' } } },
    })
  }

  const denied = await checkAndLogUsage(userId, 'class_summary')
  if (denied) throw new UsageLimitError(denied)

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Three paragraphs plus four section notes, each of them longer than the
    // "one short paragraph" they used to be. Measured rather than guessed: at
    // 900 the last block was cut off entirely and the one before it came back
    // at a third of its length, and 3000 was sized for the shorter notes.
    max_tokens: 5000,
    system: buildClassSummarySystemPrompt(exhibits, session.durationSec ?? 0, {
      teacherTalkPct: session.teacherTalkPct,
      studentTalkPct: session.studentTalkPct,
      questionCount: session.questionCount,
      higherOrderPct: session.higherOrderPct,
      avgWaitTimeSec: session.avgWaitTimeSec,
      cfuCount: session.cfuCount,
      studentVoiceDetected: segments.some((s) => s.speakerLabel === 'Student'),
      cfuMoments: ((session.cfuLog ?? []) as { timestampSec: number; text: string }[]).slice(0, 12),
      feedbackMoments: ((session.feedbackLog ?? []) as { kind: string; timestampSec: number; text: string }[]).slice(0, 12),
      directionMoments: ((session.directiveLog ?? []) as { timestampSec: number; text: string }[]).slice(0, 10),
      toneMoments: ((session.toneLog ?? []) as { kind: string; timestampSec: number; text: string }[]).slice(0, 10),
      redirectionMoments: ((session.redirectionLog ?? []) as { timestampSec: number; text: string }[]).slice(0, 10),
      nameMentions: metricNumber(session.metricsDetail, 'nameMentionCount'),
      uniqueNames: metricNumber(session.metricsDetail, 'uniqueNameCount'),
      statedObjective: lessonContentField(session.lessonContent, 'statedObjective', 'quote'),
      lessonSummary: lessonContentField(session.lessonContent, 'summary'),
      connections: lessonContentQuotes(session.lessonContent, 'connections'),
      vocabulary: lessonContentQuotes(session.lessonContent, 'vocabulary'),
      subject: lessonContentField(session.lessonContent, 'subject'),
    }),
    messages: [{ role: 'user', content: 'Write the summary now.' }],
  })
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  flagIfUnsafe(text, 'audioSessions.classSummary')

  const checksNarrative = extractTag(text, 'checks_note')
  const climateNarrative = extractTag(text, 'climate_note')
  const talkNarrative = extractTag(text, 'talk_note')
  const questionsNarrative = extractTag(text, 'questions_note')
  const contentNarrative = extractTag(text, 'content_note')
  // Stored with the connections the teacher actually made, so the section
  // that shows them has its ideas whether or not specialist notes were ever
  // generated — they were in the notes first, where a teacher who never
  // pressed that button never saw them.
  const connectionIdeas = parseLines(text, 'connection_ideas', MAX_CONNECTION_IDEAS)
  const lessonContent = session.lessonContent as Record<string, unknown> | null
  const classSummary = extractTag(text, 'class_summary')
  if (!classSummary) return null

  return prisma.audioSession.update({
    where: { id: session.id },
    data: {
      classSummary: normalizeParagraphs(classSummary),
      ...(checksNarrative ? { checksNarrative: normalizeParagraphs(checksNarrative) } : {}),
      ...(climateNarrative ? { climateNarrative: normalizeParagraphs(climateNarrative) } : {}),
      ...(talkNarrative ? { talkNarrative: normalizeParagraphs(talkNarrative) } : {}),
      ...(questionsNarrative ? { questionsNarrative: normalizeParagraphs(questionsNarrative) } : {}),
      ...(contentNarrative ? { contentNarrative: normalizeParagraphs(contentNarrative) } : {}),
      ...(connectionIdeas.length > 0 && lessonContent ? { lessonContent: { ...lessonContent, connectionIdeas } } : {}),
    },
    include: { segments: { orderBy: { startSec: 'asc' } } },
  })
}

audioSessionsRouter.post('/:id/class-summary', async (req, res) => {
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
  // Already written with the report, which is the normal case now — nothing
  // to pay for a second time.
  if (session.classSummary) {
    res.json(session)
    return
  }

  const segments: Segment[] = session.segments.map((s) => ({
    speakerLabel: s.speakerLabel,
    startSec: s.startSec,
    endSec: s.endSec,
    text: s.text,
  }))

  try {
    const updated = await writeClassSummary(req.user!.userId, session, segments)
    if (!updated) {
      res.status(502).json({ error: 'Could not generate a class summary. Please try again.' })
      return
    }
    res.json(updated)
  } catch (error) {
    if (error instanceof UsageLimitError) {
      res.status(429).json({ error: error.message })
      return
    }
    console.error('[audio-sessions] class summary failed:', error)
    res.status(502).json({ error: 'Could not generate a class summary. Please try again.' })
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
