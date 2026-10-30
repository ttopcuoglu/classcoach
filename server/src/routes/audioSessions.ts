import { readRoutines } from '../lib/routines.ts'
import { readChecksLoop } from '../lib/checksLoop.ts'
import { headlineFacts, writeHeadline } from '../lib/summaryHeadline.ts'
import { readLessonArc } from '../lib/lessonArc.ts'
import { readStretch } from '../lib/stretchBreak.ts'
import { readParticipation } from '../lib/participation.ts'
import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { analyzeTranscript, buildContentExhibits, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { enrichClassroomMoves } from '../lib/classroomMoves.ts'
import { readEscalation } from '../lib/escalation.ts'
import { readTeachingMoves } from '../lib/teachingMoves.ts'
import { parseLevelTrace, splitNonSpeech, teacherIntervals } from '../lib/settleTime.ts'
import { buildRoomTrace, openingWasRecorderOnly, roomFacts, roomShares, type RoomFacts } from '../lib/roomTrace.ts'
import { buildSoundTimeline } from '../lib/soundTimeline.ts'
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
import { classifyVoicesInFile, keepVoiceClasses, storedVoices, voiceShares } from '../lib/voiceActivity.ts'
import { unlink } from 'node:fs/promises'
import { extractTag, stripTag } from '../lib/extractTag.ts'
import { Prisma } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import {
  buildRubricEvidence,
  buildRubricLensSystemPrompt,
  DEFAULT_RUBRIC_FRAMEWORK,
  parseRubricLens,
  RUBRIC_FRAMEWORKS,
  type RubricLensResult,
} from '../lib/rubricLens.ts'
import { activeFocusFor } from '../lib/schoolPriorities.ts'
import {
  buildDebriefFocusPrompt,
  debriefFocusUserMessage,
  MIN_TEACHER_LINES,
  parseDebriefFocus,
  teacherLines,
  type DebriefSchoolFocusIdea,
} from '../lib/debriefSchoolFocus.ts'
import {
  buildHardLookEvidence,
  buildHardLookSystemPrompt,
  HARD_LOOK_SECTIONS,
  longestTeacherStretch,
  parseHardLook,
  sectionEligibility,
  unaccountedSections,
  type HardLookResult,
} from '../lib/hardLook.ts'
import { classifyModelError, logModelFailure } from '../lib/modelErrors.ts'
import { readStudentTalkFocus } from '../lib/studentTalkFocus.ts'
import { readMomentToRevisit } from '../lib/momentToRevisit.ts'
import { parseNextSteps, writeNextStepsFromNotes } from '../lib/nextSteps.ts'
import { asksForPauseAfterQuestion, focusLineKey, lineIgnoresPause, MAX_STORED_LINES, PAUSE_GOAL_SEC, rewriteWithoutPause, writeFocusLine, type FocusLine } from '../lib/focusLine.ts'

/// The sections a stored Try next time line belongs to (lib/nextSteps.ts).
const NEXT_STEP_KEYS = ['talk', 'questions', 'climate']
import { checkAndLogUsage } from '../lib/usageLimit.ts'
import { splitMetricLogs } from '../lib/metricsForClient.ts'

export const audioSessionsRouter = Router()

// Every lesson this router sends has its metricsDetail lists moved to
// metricsLogs — the iPhone app cannot decode a list inside metricsDetail
// (lib/metricsForClient.ts).
audioSessionsRouter.use((_req, res, next) => {
  const json = res.json.bind(res)
  res.json = (body?: unknown) => json(splitMetricLogs(body))
  next()
})

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
/// The speaker label for a voice the teacher said was a video playing.
export const VIDEO_SPEAKER = 'Video'

/// A video is not part of the lesson: its lines stay stored, so the tag can
/// be undone, but no read of the lesson sees them — not the analyses, not the
/// clients, including builds already in teachers' hands that count every
/// voice but the teacher's as a student. The two reads that pick speakers are
/// the only ones without it.
const LESSON_LINES = { where: { speakerLabel: { not: VIDEO_SPEAKER } }, orderBy: { startSec: 'asc' as const } }

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
    include: { segments: LESSON_LINES },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  // Worked out on read rather than stored, so every recording that carried an
  // envelope gets it — including the ones analyzed before this existed.
  const soundTimeline = buildSoundTimeline(parseLevelTrace(session.levelTrace), session.segments, session.durationSec)
  res.json({ ...session, soundTimeline })
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
  const { teacherName, classSubject, period, gradeLevel, sessionDate, status, strengths, growthAreas, nextStep, followUpDate, phases, durationSec, focusItemId } =
    req.body ?? {}

  if (status !== undefined && !isValidStatus(status)) {
    res.status(400).json({ error: 'Invalid status' })
    return
  }
  if (phases !== undefined && !Array.isArray(phases)) {
    res.status(400).json({ error: 'phases must be an array' })
    return
  }
  // The one focus for next lesson the teacher picked from Try next time — the
  // id of that item; null goes back to the suggested one.
  if (focusItemId !== undefined && focusItemId !== null && (typeof focusItemId !== 'string' || !/^[a-z-]{1,40}$/.test(focusItemId))) {
    res.status(400).json({ error: 'Invalid focusItemId' })
    return
  }

  // Choosing a focus replaces `next` only: the short lines already written
  // for this lesson's items (lib/focusLine.ts) are kept, so going back to one
  // does not write it again.
  let lessonFocus: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined
  if (focusItemId !== undefined) {
    const current = await prisma.audioSession.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      select: { lessonFocus: true },
    })
    const lines = focusLinesOf(current?.lessonFocus)
    const next = focusItemId ? { itemId: focusItemId, chosenAt: new Date().toISOString() } : null
    lessonFocus = next || lines ? { ...(next ? { next } : {}), ...(lines ? { lines } : {}) } : Prisma.DbNull
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
      ...(lessonFocus !== undefined ? { lessonFocus } : {}),
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
/// `role` is what the voice is tagged as now — before any tagging, every voice
/// is 'student' — so a re-tag can open on the teacher's earlier choice.
function speakerSamplesFrom(
  segments: { rawSpeakerTag: string; speakerLabel?: string; text: string; startSec: number; endSec: number }[],
) {
  const byTag = new Map<string, { sample: string; totalSec: number; utteranceCount: number; role: 'teacher' | 'video' | 'student' }>()
  for (const segment of segments) {
    const role = segment.speakerLabel === 'Teacher' ? 'teacher' : segment.speakerLabel === VIDEO_SPEAKER ? 'video' : 'student'
    const entry = byTag.get(segment.rawSpeakerTag) ?? { sample: '', totalSec: 0, utteranceCount: 0, role }
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
      role: e.role,
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
  // What kind of sound each second was, read from the scratch copy while
  // Deepgram has it — this is the last moment the audio exists. Best-effort:
  // a lesson without it is "not measured", never a failed transcription, and
  // the reason is kept with the lesson.
  const [utterances, voices] = await Promise.all([
    transcribeAudioFile(audioPath, mimetype),
    classifyVoicesInFile(audioPath).catch((error: unknown) => {
      console.error('[audio-sessions] voice classes failed:', error)
      return { unread: `error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) }
    }),
  ])
  if ('unread' in voices) console.log(`[audio-sessions] no voice classes for ${sessionId}: ${voices.unread}`)
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
          speakerConfidence: u.speakerConfidence ?? Prisma.DbNull,
        },
      }),
    ),
  )

  const durationSec = Math.round(Math.max(...utterances.map((u) => u.end)))
  const before = await prisma.audioSession.findUnique({ where: { id: sessionId }, select: { metricsDetail: true } })
  const kept = { ...(before?.metricsDetail as Prisma.JsonObject | null) }
  delete kept.voiceTrace
  delete kept.voiceTraceUnread
  for (const key of ['voicePitch', 'voiceLevel', 'voiceDepth', 'voiceClarity']) delete kept[key]
  await prisma.audioSession.update({
    where: { id: sessionId },
    data: {
      status: 'tagging',
      durationSec,
      failureReason: null,
      metricsDetail: {
        ...kept,
        ...('trace' in voices ? { ...storedVoices(voices), ...voiceShares(voices.trace) } : { voiceTraceUnread: voices.unread }),
      },
    },
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
    select: { rawSpeakerTag: true, speakerLabel: true, text: true, startSec: true, endSec: true },
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
    // The loudness envelope the device measured while recording. Validated
    // rather than trusted — it arrives from a client, and anything that is
    // not a usable envelope becomes no envelope.
    const levelTrace = parseLevelTrace(req.body?.levelTrace)
    await prisma.audioSession.update({
      where: { id: sessionId },
      data: {
        status: 'transcribing',
        transcribeStartedAt: new Date(),
        failureReason: null,
        ...(levelTrace ? { levelTrace } : {}),
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
            speakerConfidence: u.speakerConfidence ?? Prisma.DbNull,
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
  // `videoSpeakerTags` are voices the teacher said were a video playing; see
  // VIDEO_SPEAKER. Absent from builds that predate it, which tag none.
  const { rawSpeakerTags, rawSpeakerTag, videoSpeakerTags } = req.body ?? {}
  const requested: unknown[] = Array.isArray(rawSpeakerTags) ? rawSpeakerTags : [rawSpeakerTag]
  const tagsIn = (list: unknown[]) =>
    Array.from(new Set(list.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)))
  const teacherTags = tagsIn(requested)
  const videoTags = tagsIn(Array.isArray(videoSpeakerTags) ? videoSpeakerTags : [])
  if (teacherTags.length === 0) {
    res.status(400).json({ error: 'Pick at least one teacher voice.' })
    return
  }
  if (videoTags.some((t) => teacherTags.includes(t))) {
    res.status(400).json({ error: 'A voice can be you or a video, not both.' })
    return
  }

  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: { select: { rawSpeakerTag: true } } },
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
  if ([...teacherTags, ...videoTags].some((t) => !knownTags.has(t))) {
    res.status(400).json({ error: 'Unknown speaker for this session.' })
    return
  }

  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { in: teacherTags } },
    data: { speakerLabel: 'Teacher' },
  })
  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { in: videoTags } },
    data: { speakerLabel: VIDEO_SPEAKER },
  })
  await prisma.transcriptSegment.updateMany({
    where: { sessionId: session.id, rawSpeakerTag: { notIn: [...teacherTags, ...videoTags] } },
    data: { speakerLabel: 'Student' },
  })

  const segments: Segment[] = (
    await prisma.transcriptSegment.findMany({
      where: { sessionId: session.id, ...LESSON_LINES.where },
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
/// longer than any phone will hold a request open. Exported for the demo
/// seeds, which pass `awaitSummary` so the prose is in place before they exit.
export async function runAnalysis(sessionId: string, userId: string, segments: Segment[], { awaitSummary = false } = {}) {
  // The phrase scan first, then Claude reads the transcript and overrides it —
  // both reads at once, since a teacher is waiting on this. Best-effort by
  // design: if either call fails the phrase answer stands, so a transcript is
  // never lost to them.
  const scanned = analyzeTranscript(segments)
  // The moment to revisit rides along: it reads the same transcript and needs
  // nothing from the other two. Null if it fails, and the Summary tab asks
  // again — see the /:id/moment-to-revisit route.
  // The escalation read rides along with these: it needs the teacher's speech
  // and the coverage figure the phrase scan already computed, and nothing
  // from the other reads.
  const [analysis, lessonContent, momentToRevisit, escalation, teachingMoves, participation, stretch, arc] = await Promise.all([
    enrichClassroomMoves(scanned, segments),
    enrichLessonContent(detectLessonContent(segments, scanned.phases), segments),
    readMomentToRevisit(segments),
    readEscalation(segments, scanned.metricsDetail),
    // Rides along with the others: it reads the teacher's side of the same
    // transcript and needs nothing any of them produce.
    readTeachingMoves(segments),
    // How the teacher brought students in — stored with the teaching moves.
    readParticipation(segments),
    // The longest stretch: what it was about, and a break where one fits.
    readStretch(segments),
    // How the lesson moved, stage by stage.
    readLessonArc(segments, segments.reduce((max, seg) => Math.max(max, seg.endSec), 0)),
  ])

  // What each set of directions was for, and invitations to ask for help.
  // Needs the directions the teaching-moves read found, so it runs after it.
  const routines = teachingMoves ? await readRoutines(segments, teachingMoves.directions) : null

  // Who each check asked and whether the teacher acted on what came back —
  // Questioning & Checking's checks list. Null means the read failed and the
  // checks log stands as it was.
  const checksLog = await readChecksLoop(analysis.cfuLog, segments)

  // What the student talk was ABOUT, which needs the objective and so cannot
  // run alongside the two reads above. It is the only thing in this report
  // that can tell a discussion from a room talking over itself — every other
  // student-talk number is a duration, and both rooms produce the same
  // durations. Best-effort like the rest: null means not measured, and the
  // report says so rather than filling it in.
  const studentTalkFocus = await readStudentTalkFocus(segments, {
    objective: lessonContent.statedObjective?.quote ?? null,
    summary: lessonContent.summary ?? null,
    subject: lessonContent.subject ?? null,
  })

  // Notes are no longer auto-generated from raw metrics here — they're
  // populated later from the Reflect tab's actual coaching conversation
  // (see reflect-summary below), so the teacher doesn't see two independent
  // AI-written takeaways derived from the same numbers.
  // Silence told apart from sound the transcript has no words for. Only
  // possible where the device uploaded an envelope, which is recordings made
  // after that shipped — everything older keeps the combined slice, which is
  // the honest answer when there is nothing to split it with.
  const stored = await prisma.audioSession.findUnique({
    where: { id: sessionId },
    select: { levelTrace: true, durationSec: true, metricsDetail: true },
  })
  const trace = parseLevelTrace(stored?.levelTrace)
  // Measured from the audio at upload, which is gone now: re-analysing must
  // carry it over, because nothing could measure it again.
  const voiceClasses = keepVoiceClasses(stored?.metricsDetail)
  // Teacher, student, group, a voice with no words, other or quiet for
  // every second: the voice classes read against who the transcript now
  // says spoke. The video's lines are left out of `segments`, as from every
  // read of the lesson, but here they say when the video played.
  const videoLines =
    voiceClasses.voiceTrace !== undefined
      ? await prisma.transcriptSegment.findMany({
          where: { sessionId, speakerLabel: VIDEO_SPEAKER },
          select: { speakerLabel: true, startSec: true, endSec: true },
        })
      : []
  const roomTrace = voiceClasses.voiceTrace !== undefined ? buildRoomTrace(voiceClasses, [...segments, ...videoLines]) : null
  const nonSpeech = trace
    ? splitNonSpeech(
        trace,
        teacherIntervals(segments),
        stored?.durationSec ?? analysis.metricsDetail.totalDurationSec,
        segments.map((s) => ({ startSec: s.startSec, endSec: s.endSec })),
      )
    : null

  // The Summary headline: the one pattern across the sections, written from
  // the same facts the sections show. Needs every read above.
  const headline = teachingMoves
    ? await writeHeadline(
        headlineFacts({
          durationSec: stored?.durationSec ?? null,
          teacherTalkPct: analysis.teacherTalkPct,
          questionLog: analysis.questionLog,
          teachingMoves: { ...teachingMoves, ...(participation ? { participation } : {}), ...(arc ? { arc } : {}) },
          metricsDetail: analysis.metricsDetail,
          lessonContent,
        }),
      )
    : null

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
      metricsDetail: {
        ...analysis.metricsDetail,
        ...(nonSpeech ? { quietSec: nonSpeech.quietSec, unresolvedSec: nonSpeech.unresolvedSec } : {}),
        ...voiceClasses,
        ...(roomTrace ? { roomTrace, ...roomShares(roomTrace) } : {}),
      },
      highlights: analysis.highlights,
      phases: analysis.phases,
      questionLog: analysis.questionLog,
      cfuLog: (checksLog ?? analysis.cfuLog) as unknown as Prisma.InputJsonValue,
      feedbackLog: analysis.feedbackLog,
      directiveLog: analysis.directiveLog,
      toneLog: analysis.toneLog,
      redirectionLog: analysis.redirectionLog,
      lessonContent,
      // Prisma's Json columns distinguish "SQL NULL" from "JSON null"; the
      // former is what "not measured" means here, and what every reader
      // treats as absent.
      studentTalkFocus: studentTalkFocus ?? Prisma.DbNull,
      // Rewritten on every analysis, so re-tagging the speakers and analyzing
      // again cannot leave a moment chosen from the old labels.
      momentToRevisit: momentToRevisit ?? Prisma.DbNull,
      escalation: escalation ?? Prisma.DbNull,
      teachingMoves: teachingMoves
        ? ({
            ...teachingMoves,
            ...(participation ? { participation } : {}),
            ...(stretch ? { stretch } : {}),
            ...(arc ? { arc } : {}),
            ...(routines ? { routines } : {}),
            ...(headline ? { headline } : {}),
          } as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
    include: { segments: LESSON_LINES },
  })

  // The report is complete without the prose: it is one 5000-token call, and
  // the Summary tab asks for it when it isn't there yet.
  const summary = writeClassSummary(userId, updated, segments).catch((error) => {
    console.error('[audio-sessions] class summary after analysis failed:', error)
  })
  if (awaitSummary) await summary

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
    res.status(409).json({ error: "This report's conversation is full — Talk It Through can carry on from here." })
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
    res.status(409).json({ error: "This report's conversation is full — Talk It Through can carry on from here." })
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
    include: { segments: LESSON_LINES },
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
      include: { segments: LESSON_LINES },
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
    include: { segments: LESSON_LINES },
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
      include: { segments: LESSON_LINES },
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
      include: { segments: LESSON_LINES },
    })
    res.json(updated)
  } catch (error) {
    const failure = classifyModelError(error, 'Could not build the rubric lens')
    logModelFailure('[audio-sessions] rubric lens failed:', failure, error)
    res.status(failure.status).json({ error: failure.message })
  }
})

// An idea for next time connected to a school focus the teacher chose — on
// request from Try next time, never part of the analysis. Kept once made, like
// Rubric Lens; only from the teacher's own words (lib/debriefSchoolFocus.ts).
audioSessionsRouter.post('/:id/school-focus-idea', async (req, res) => {
  const userId = req.user!.userId
  const session = await prisma.audioSession.findFirst({ where: { id: String(req.params.id), userId }, include: { segments: LESSON_LINES } })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (session.status !== 'analyzed') {
    res.status(400).json({ error: 'This report is not ready yet.' })
    return
  }
  const stored = session.schoolFocusIdea as DebriefSchoolFocusIdea | null
  const withSegments = () => prisma.audioSession.findFirst({ where: { id: session.id }, include: { segments: LESSON_LINES } })
  if (stored && !stored.dismissed) {
    res.json(await withSegments())
    return
  }

  // Only a focus the teacher has on right now: the choice is theirs, and a
  // paused or changed focus is not one they are using.
  const focuses = await activeFocusFor(userId)
  const wanted = typeof req.body?.priorityId === 'string' ? req.body.priorityId : null
  const focus = focuses.find((f) => f.id === wanted) ?? (wanted ? null : focuses[0])
  if (!focus) {
    res.status(409).json({ error: 'Turn this school focus on in Profile to get ideas connected to it.' })
    return
  }

  const lines = teacherLines(session.segments)
  let idea: DebriefSchoolFocusIdea
  if (lines.length < MIN_TEACHER_LINES) {
    idea = {
      priorityId: focus.id,
      name: focus.name,
      generatedAt: new Date().toISOString(),
      quote: null,
      text: null,
      none: 'Too little of your own talk was captured in this recording to find a moment for this.',
    }
  } else {
    const denied = await checkAndLogUsage(userId, 'school_focus_debrief')
    if (denied) {
      res.status(429).json({ error: denied })
      return
    }
    try {
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 800,
        thinking: { type: 'disabled' },
        system: buildDebriefFocusPrompt(focus),
        messages: [{ role: 'user', content: debriefFocusUserMessage(lines) }],
      })
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
      flagIfUnsafe(text, 'audioSessions.schoolFocusIdea')
      idea = parseDebriefFocus(text, lines, focus)
    } catch (error) {
      const failure = classifyModelError(error, 'Could not look for an idea')
      logModelFailure('[audio-sessions] school focus idea failed:', failure, error)
      res.status(failure.status).json({ error: failure.message })
      return
    }
  }
  await prisma.audioSession.update({ where: { id: session.id }, data: { schoolFocusIdea: idea as unknown as Prisma.InputJsonValue } })
  res.json(await withSegments())
})

audioSessionsRouter.post('/:id/school-focus-idea/dismiss', async (req, res) => {
  const session = await prisma.audioSession.findFirst({ where: { id: String(req.params.id), userId: req.user!.userId }, select: { id: true, schoolFocusIdea: true } })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  const stored = session.schoolFocusIdea as DebriefSchoolFocusIdea | null
  if (stored) {
    await prisma.audioSession.update({ where: { id: session.id }, data: { schoolFocusIdea: { ...stored, dismissed: true } as unknown as Prisma.InputJsonValue } })
  }
  res.status(204).end()
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
    include: { segments: LESSON_LINES },
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
      include: { segments: LESSON_LINES },
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
    withheld,
    longestTeacherStretch(
      session.segments.map((s) => ({
        speakerLabel: s.speakerLabel,
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
      })),
    ),
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
        // Eight to ten findings, each with a case, a cost and a next step,
        // plus a clear for any section that has none — 2500 ran this short.
        max_tokens: 4000,
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
      include: { segments: LESSON_LINES },
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
  /// The same thing as a count, which is what the notes are allowed to say.
  higherOrderCount?: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  studentVoiceDetected: boolean
  /// Speaking pace, the pause after a student answer, and when the first word
  /// was transcribed. Without these the section narratives cannot mention
  /// them — and the narratives are what "Try next time" is written from, so a
  /// measurement the prompt never sees produces no suggestion no matter how
  /// plainly it is printed on the page.
  teacherWordsPerMinute?: number | null
  waitTime2Sec?: number | null
  waitTime2SampleCount?: number | null
  firstWordSec?: number | null
  /// The room second by second, as the report's tiles and strip show it, for
  /// lessons that have it. Without it the note was told only teacher, student
  /// and "silence", and explained a silence share that was mostly group talk
  /// and a video as the recorder running before the lesson.
  room?: RoomFacts | null
  /// What the audible student talk was about (lib/studentTalkFocus.ts), so the
  /// talk note can say whether the student share meant a discussion or a room
  /// talking over itself. Null is "not measured", which is common.
  studentTalkFocus?: unknown
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

/// The pace as the note should read it. "Notably quick" was left to the
/// model, which called 164 against a 120-160 range notable.
export function paceReading(wpm: number): string {
  if (wpm < 120) return 'Reading: below the usual range.'
  if (wpm <= 160) return 'Reading: inside the usual range — do not mention pace.'
  if (wpm <= 180) return 'Reading: a little above the usual range — not worth mentioning.'
  return 'Reading: well above the usual range.'
}

/// The room's seconds as the tiles group them, for the measured list.
function roomLines(room: RoomFacts): string {
  const total = room.teacherSec + room.studentSec + room.groupSec + room.videoSec + room.quietSec
  const part = (sec: number) => `${mmss(sec)} (${total > 0 ? Math.round((sec / total) * 100) : 0}%)`
  return [
    `- the room second by second, as the report's tiles show it. "Silence" above is everything that was not teacher or student words; here it is split:`,
    `  - teacher voice: ${part(room.teacherSec)}`,
    `  - student voice: ${part(room.studentSec)}`,
    `  - group voice, sound with no transcribed words — most often students talking together: ${part(room.groupSec)}`,
    `  - a video or audio the teacher tagged: ${part(room.videoSec)}`,
    `  - quiet time, the microphone heard nothing: ${part(room.quietSec)}`,
  ].join('\n')
}

/// What may be said about the start of the recording. The trace says whether
/// the wordless opening was quiet; without it the old firstWordSec line is
/// kept, and only for an opening long enough to matter.
export function openingLine(metrics: ClassSummaryMetrics | undefined): string {
  const room = metrics?.room
  if (room) {
    if (openingWasRecorderOnly(room)) {
      return `The first ${mmss(room.openingSec)} were quiet with no words, so that is the recorder running before the lesson got going rather than quiet in the room.`
    }
    return room.openingSec >= 30
      ? `The first ${mmss(room.openingSec)} had sound but no transcribed words — the room was not quiet. Do not describe the start of the recording as silence or the recorder running early.`
      : ''
  }
  return metrics?.firstWordSec != null && metrics.firstWordSec >= 30
    ? `Nothing was transcribed until ${mmss(metrics.firstWordSec)}. Whether that stretch was quiet or a room settling is not known, so do not say which.`
    : ''
}

/// The room facts for a lesson that carries the per-second trace.
function storedRoomFacts(detail: unknown): RoomFacts | null {
  const trace = detail && typeof detail === 'object' ? (detail as Record<string, unknown>).roomTrace : null
  return typeof trace === 'string' && trace.length > 0 ? roomFacts(trace) : null
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
- student talk: ${metrics.studentTalkPct ?? 'not measured'}%${metrics.studentVoiceDetected ? '' : ' (NO student voice was separately detected at all)'}${metrics.room ? `\n${roomLines(metrics.room)}` : ''}
- questions asked: ${metrics.questionCount ?? 'not measured'}
- of those, higher-order: ${
        metrics.higherOrderCount != null && metrics.questionCount != null
          ? `${metrics.higherOrderCount} of ${metrics.questionCount}`
          : 'not measured'
      } (a count — never restate it as a percentage)
- average wait time after a question: ${metrics.avgWaitTimeSec ?? 'not measured'}s${metrics.studentVoiceDetected ? '' : ' (NOT reliable here: with no student voice separated, a student answer reads as the teacher still talking)'}
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
${metrics?.teacherWordsPerMinute != null ? `Teacher speaking pace: about ${metrics.teacherWordsPerMinute} words a minute of their own speaking time, short pauses included (everyday conversation usually runs about 120-160). ${paceReading(metrics.teacherWordsPerMinute)}` : 'Teacher speaking pace: not measured.'}
${
    metrics?.waitTime2Sec != null
      ? `Pause after a student finished answering, before the teacher spoke: about ${metrics.waitTime2Sec}s across ${metrics.waitTime2SampleCount ?? 0} exchanges. This is a different number from the wait time above, which is the pause AFTER THE QUESTION.`
      : 'Pause after a student answer: not measured.'
  }
${openingLine(metrics)}
${(() => {
    const f = metrics?.studentTalkFocus as
      | { classified?: number; onTopic?: number; procedural?: number; offTopic?: number; unclear?: number }
      | null
      | undefined
    return f && (f.classified ?? 0) > 0
      ? `What the student talk was about: of ${f.classified} audible student turns, ${f.onTopic ?? 0} engaged the lesson's content, ${f.procedural ?? 0} were about how to do the work, ${f.offTopic ?? 0} were about something else, and ${f.unclear ?? 0} were too unclear or garbled to place. A high unclear count is the microphone, not the students.`
      : 'What the student talk was about: not measured for this lesson (too few audible student turns to characterise).'
  })()}

Then THE TALK NOTE: one paragraph about who was heard and for how long,
covering both the shape of the teacher's talk and where students got
the floor, and what that does and does not tell us.
The numbers — ${metrics?.room ? 'teacher voice, student voice, group voice, video and quiet time' : 'teacher talk, student talk, silence'} — are on that screen, so do
not restate them. Pace is the exception worth making: how fast the teacher
spoke is new to this report and a teacher will not have it in mind. Go by the
reading given with the pace above: mention it only where that reading says it
is well above the usual range, plainly and in their own terms — not as a
verdict, since there is no correct rate and a fast stretch of storytelling is
not a fault. Never call a pace inside or a little above the range quick. Say
nothing about the start of the recording beyond what the line about it above
says, and never stretch seconds into "minutes". Say what they cannot: where the long teacher stretches fell
and what they were doing (explaining, setting up, recapping), where students
got the floor, and whether the shape changed across the lesson. The caveat
governs this section more than any other, and it cuts both ways. A room
microphone hears the teacher clearly and students poorly, so a low student
number may be a quiet room or a mic that could not reach it. And a HIGH
student number is not praise either: a recording cannot tell a discussion from
a room talking over itself, since both raise the student share and both
produce many short student turns. Never call a high student share strong
participation, real back-and-forth, or student-centred on the strength of the
number alone. The one thing that does separate those two rooms is what the
student talk was ABOUT, and when that is given above you may use it: say so
plainly, in proportions rather than percentages, and treat a large unclear
share as the microphone's limit rather than the students'. When it is not
given, say what was audible and leave the reading of it to the teacher, who
was in the room.

Then THE QUESTIONS NOTE: one paragraph about the questioning, covering both
what was asked and what happened after it was asked. Two pauses matter here
and they are different: the one after the question, and the one after a
student's answer. The second is the one with nothing in this report before
now, and it is usually what explains a low follow-up count — a pause of a few
tenths of a second leaves nowhere for a follow-up to go. Where that is what
the numbers show, say it, because it turns a count the teacher cannot act on
into one they can. Again the
counts are already on screen. Say what kinds of questions these were, whether
they built on each other or moved on, what happened after one was asked, and
whether answers were followed up or accepted. When you mention how many were
higher-order, give it as a count — "three of the seven" — and never as a
percentage: with a handful of questions a percentage reads as a score. State
it once, plainly, and move on to the questions themselves — do not comment on
the count, qualify it, or explain what it is. It is not a judgement of the
teacher's questioning, and the way to honour that is to describe what a
specific question asked of students, not to add a caveat.

Then WAYS INTO THIS TOPIC: up to three real-world connections a teacher could use for THIS topic — the everyday thing, job, story, or phenomenon, and the question that opens it with students. Concrete and specific: "a calendar app's moon icons" beats "something from daily life". These are ideas for next time, so write them even when the teacher already made good connections, and never imply they made none.

Then THE CONTENT NOTE: one warm paragraph opening the Clarity & Content section — what this lesson was about and what the teacher did with the content: the explanation, the model or representation, the examples, the vocabulary, the connections drawn. Lead with what worked; this paragraph opens the section, it does not grade it. Name the actual ideas and terms, never "the content" in the abstract.

Then NEXT TIME, three separate lines: one for Talk & Participation, one for Questioning & Checking, one for Climate & Routines. Each is ONE concrete thing to do in the next lesson, following directly from what that section's note said — the words to say or the task to set, specific to this lesson's material, 30 words at most, starting with a verb. "After your next 'why' question, give pairs thirty seconds before taking an answer." Not a principle, not "consider", and not a repeat of another section's line. Where a section's evidence does not support a suggestion — too little was audible, or nothing there needs changing — write NONE: a made-up suggestion is worse than none, and most lessons will not earn all three.
${metrics && !metrics.studentVoiceDetected ? `No student voice was separated from the teacher's in this lesson, so students' answers sit inside the teacher's lines. No line may rest on the measured pause after a question, on how long the teacher talked without a break, or on the count of answers followed up: none of those can be measured here. A suggestion about questioning moves is still fine.\n` : ''}${metrics?.avgWaitTimeSec != null && metrics.avgWaitTimeSec >= 3 ? `The wait after a question was already about ${metrics.avgWaitTimeSec}s, and three or more is the goal, so no line may tell the teacher to pause longer after asking a question. A pause after a student's ANSWER is a different pause and may still be suggested, named as that.\n` : ''}
WRITE ABOUT THE LESSON, NOT THE REPORT. No note explains how a number was produced. Nothing is "coded as", "logged as", "marked as", "recognised as", "counted as", "matched" or "detected by" anything, and there is no "the system" or "the figure comes from" — a teacher reading about their own lesson should never have to read about software. How the numbers are made is explained once, on the page, under "How to read these numbers". What the microphone could and could not hear is different: that is about the recording, and it stays.

LENGTH OF THE FIVE NOTES. The checks, climate, talk, questions and content notes each open a section a teacher then reads the evidence under, so each has a hard limit of four sentences and 80 words, whatever the fuller descriptions above invite. Count before you answer; a fifth sentence or a long final clause is over the limit. Say the one or two things that matter most about that section in this lesson, keep any caveat about the microphone to a single clause, and leave the rest to the evidence below the note. The class summary is not shortened: it keeps its three paragraphs.

Respond with exactly these blocks and nothing else. The summary block
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
<talk_next>one line, or NONE</talk_next>
<questions_next>one line, or NONE</questions_next>
<climate_next>one line, or NONE</climate_next>
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
type ClassSummarySource = {
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
    studentTalkFocus?: unknown
  }

/// The model call behind the class summary, on its own so a script can see
/// what comes back for a real lesson without writing it (scripts/tryNextSteps).
export async function requestClassSummaryText(session: ClassSummarySource, segments: Segment[]): Promise<string> {
  const exhibits = buildContentExhibits(segments)
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
      higherOrderCount: metricNumber(session.metricsDetail, 'higherOrderQuestionCount'),
      avgWaitTimeSec: session.avgWaitTimeSec,
      cfuCount: session.cfuCount,
      studentVoiceDetected: segments.some((s) => s.speakerLabel === 'Student'),
      teacherWordsPerMinute: metricNumber(session.metricsDetail, 'teacherWordsPerMinute'),
      waitTime2Sec: metricNumber(session.metricsDetail, 'waitTime2Sec'),
      waitTime2SampleCount: metricNumber(session.metricsDetail, 'waitTime2SampleCount'),
      firstWordSec: metricNumber(session.metricsDetail, 'firstWordSec'),
      room: storedRoomFacts(session.metricsDetail),
      studentTalkFocus: session.studentTalkFocus ?? null,
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
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/// Returns null when there is nothing to write (over the usage limit, or the
/// model gave back no summary), so a caller that already has a report can
/// keep it rather than lose it to this.
async function writeClassSummary(
  userId: string,
  session: ClassSummarySource,
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
      include: { segments: LESSON_LINES },
    })
  }

  const denied = await checkAndLogUsage(userId, 'class_summary')
  if (denied) throw new UsageLimitError(denied)

  const text = await requestClassSummaryText(session, segments)
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
  const nextSteps = parseNextSteps(text)

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
      // Always written, even empty: "this summary suggested nothing" is an
      // answer, and null is what tells the report to ask (/:id/next-steps).
      nextSteps,
    },
    include: { segments: LESSON_LINES },
  })
}

audioSessionsRouter.post('/:id/class-summary', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: LESSON_LINES },
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

// The moment to revisit for a report that does not have one yet: every report
// analyzed before this shipped, and any whose read failed during analysis. The
// Summary tab asks once on first view, the way it asks for the class summary.
// Read once and kept — including "nothing stood out" and "not enough was
// captured", which are answers, so a lesson is never read twice hoping for a
// different one.
audioSessionsRouter.post('/:id/moment-to-revisit', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: LESSON_LINES },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  if (session.momentToRevisit || session.status === 'locked') {
    res.json(session)
    return
  }
  if (session.status !== 'analyzed') {
    res.status(409).json({ error: 'This lesson has not been analyzed yet.' })
    return
  }

  const moment = await readMomentToRevisit(
    session.segments.map((s) => ({ speakerLabel: s.speakerLabel, startSec: s.startSec, endSec: s.endSec, text: s.text })),
  )
  if (!moment) {
    res.status(502).json({ error: 'Could not read this lesson for a moment to revisit. Please try again.' })
    return
  }
  const updated = await prisma.audioSession.update({
    where: { id: session.id },
    data: { momentToRevisit: moment },
    include: { segments: LESSON_LINES },
  })
  res.json(updated)
})

/// The short focus lines stored on a lesson, or null when there are none.
function focusLinesOf(lessonFocus: unknown): Record<string, FocusLine> | null {
  const lines = (lessonFocus as { lines?: unknown } | null)?.lines
  return lines && typeof lines === 'object' && Object.keys(lines).length > 0 ? (lines as Record<string, FocusLine>) : null
}

// The one focus for next lesson, said simply — see lib/focusLine.ts. Asked for
// when a Summary opens on a focus that has no short line yet; the text is the
// Try next time item as the page shows it, and the line is kept under its key.
audioSessionsRouter.post('/:id/focus-line', async (req, res) => {
  const { text, from, pauseSec: rawPause } = req.body ?? {}
  // The lesson's Teacher Pause Time, as the app shows it; older apps send none.
  const pauseSec = typeof rawPause === 'number' && Number.isFinite(rawPause) ? Math.round(rawPause * 10) / 10 : null
  if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
    res.status(400).json({ error: 'text is required' })
    return
  }
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: { id: true, lessonFocus: true },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  const key = focusLineKey(text)
  const lines = focusLinesOf(session.lessonFocus) ?? {}
  // A stored line that asks for a pause the lesson already shows is written
  // again, and the new one replaces it under the same key.
  if (lines[key] && !lineIgnoresPause(lines[key], pauseSec)) {
    res.json({ key, line: lines[key] })
    return
  }

  const line = await writeFocusLine(text, typeof from === 'string' ? from.slice(0, 80) : null, pauseSec)
  if (!line) {
    res.status(502).json({ error: 'Could not shorten this focus. Please try again.' })
    return
  }
  // Newest last; the oldest go first if a lesson ever runs past the cap.
  const kept = Object.entries({ ...lines, [key]: line }).slice(-MAX_STORED_LINES)
  const current = (session.lessonFocus ?? {}) as Record<string, unknown>
  await prisma.audioSession.update({
    where: { id: session.id },
    data: { lessonFocus: { ...current, lines: Object.fromEntries(kept) } as Prisma.InputJsonValue },
  })
  res.json({ key, line })
})

// "Try next time" lines for a report summarized before they existed, written
// from the section notes it already has — see lib/nextSteps.ts. Asked for
// once, when such a report is opened, and kept whatever comes back.
audioSessionsRouter.post('/:id/next-steps', async (req, res) => {
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    include: { segments: LESSON_LINES },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  // Nothing to add to: a report that has them, one that is final, and one
  // whose summary is still being written — that call brings its own.
  if (session.nextSteps || session.status === 'locked' || !session.classSummary) {
    res.json(session)
    return
  }

  const nextSteps = await writeNextStepsFromNotes({
    lessonSummary: lessonContentField(session.lessonContent, 'summary'),
    talk: session.talkNarrative,
    questions: session.questionsNarrative,
    checks: session.checksNarrative,
    climate: session.climateNarrative,
  })
  if (!nextSteps) {
    res.status(502).json({ error: 'Could not write next steps for this lesson. Please try again.' })
    return
  }
  const updated = await prisma.audioSession.update({
    where: { id: session.id },
    data: { nextSteps },
    include: { segments: LESSON_LINES },
  })
  res.json(updated)
})

// A stored "Try next time" line that asks the teacher to pause after asking,
// on a lesson whose Teacher Pause Time already met the goal: written before
// the suggestions were told the pause, it sat under a card showing 4.1 s
// after the very question it named. Rewritten once without the pause and
// kept; the app asks when it finds one.
audioSessionsRouter.post('/:id/next-steps/without-pause', async (req, res) => {
  const { key, pauseSec } = req.body ?? {}
  if (!NEXT_STEP_KEYS.includes(key) || typeof pauseSec !== 'number' || pauseSec < PAUSE_GOAL_SEC) {
    res.status(400).json({ error: 'key and a pause of at least three seconds are required' })
    return
  }
  const session = await prisma.audioSession.findFirst({
    where: { id: req.params.id, userId: req.user!.userId },
    select: { id: true, nextSteps: true, status: true },
  })
  if (!session) {
    res.status(404).json({ error: 'Session not found' })
    return
  }
  const steps = (session.nextSteps ?? {}) as Record<string, unknown>
  const current = steps[key]
  // Nothing to do: already rewritten, or a line that never asked for it.
  if (typeof current !== 'string' || !asksForPauseAfterQuestion(current) || session.status === 'locked') {
    res.json({ nextSteps: session.nextSteps })
    return
  }
  const rewritten = await rewriteWithoutPause(current)
  if (!rewritten) {
    res.status(502).json({ error: 'Could not rewrite this suggestion.' })
    return
  }
  const nextSteps = { ...steps, [key]: rewritten }
  await prisma.audioSession.update({ where: { id: session.id }, data: { nextSteps } })
  res.json({ nextSteps })
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
