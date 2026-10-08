import { Router } from 'express'
import multer from 'multer'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { hasActivePlan, hasActivePlanFor, PLAN_USER_SELECT } from '../lib/billing.ts'
import {
  persistMemoryUpdate,
  buildMemoryContextBlock,
  MEMORY_UPDATE_INSTRUCTION,
  MEMORY_UPDATE_TOKEN_BUFFER,
  shouldWriteMemory,
} from '../lib/coachMemory.ts'
import { buildExperienceContextBlock } from '../lib/experience.ts'
import { TALK_REPLY_WORD_BUDGET } from '../lib/replyBudget.ts'
import { streamCoachReply, trimIfTruncated } from '../lib/coachStream.ts'
import { buildFollowUpContextBlock, checkInQuestionFor, nextCheckInDate } from '../lib/followUps.ts'
import {
  appendTurn,
  CHAT_TURN_CAP,
  CONVERSATION_FULL_MESSAGE,
  countUserTurns,
  TALK_TURN_CAP,
  toClaudeMessages,
  type ChatMessage,
} from '../lib/coachingChat.ts'
import { CORE_COACHING_RULES, firstNameOf } from '../lib/coachPersona.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { transcribeAudio } from '../lib/deepgram.ts'
import { extractTag, stripStructuralTags, stripTag } from '../lib/extractTag.ts'
import type { CoachFollowUp, Debrief } from '../generated/prisma/client.ts'
import { prisma } from '../lib/prisma.ts'
import { buildDigestFor } from '../lib/coachDigest.ts'
import { cachedSystem } from '../lib/promptCache.ts'
import { categoryInArea, isKnownCategory } from '../lib/scenarioCategories.ts'
import {
  isCourseLevelFor,
  offersCourses,
  pickClassMakeup,
  pickGradeBand,
} from '../lib/teachingContext.ts'
import {
  TEACHING_AND_LEARNING,
  findFocusArea,
  focusAreaForSubCategory,
  type FocusArea,
} from '../lib/focusAreas.ts'
import {
  classificationBlock,
  coachIdentity,
  incidentShape,
  ratingStandard,
  teachingContextBlock,
} from '../lib/focusAreaPrompt.ts'
import { generateShareToken } from '../lib/shareToken.ts'
import { startTiming } from '../lib/turnTiming.ts'
import { checkAndLogUsage, checkUsage, logUsage } from '../lib/usageLimit.ts'

export const debriefRouter = Router()

// Talk It Through adds the takeaway, which only it has; everything else uses
// the shared wording (see CONVERSATION_FULL_MESSAGE for why it changed).
function conversationFullMessage(isTalk: boolean): string {
  return isTalk
    ? 'This conversation has reached its length limit. Finish the session to save your takeaway, or start a new conversation.'
    : CONVERSATION_FULL_MESSAGE
}

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
  const timing = startTiming('transcribe')
  try {
    const utterances = await transcribeAudio(req.file.buffer, req.file.mimetype)
    timing.mark('deepgram')
    const transcript = utterances
      .slice()
      .sort((a, b) => a.start - b.start)
      .map((u) => u.transcript)
      .join(' ')
      .trim()
    timing.end({ bytes: req.file.size, chars: transcript.length })
    res.json({ transcript })
  } catch (error) {
    console.error('[debrief] transcription failed:', error)
    res.status(502).json({ error: 'Could not transcribe the recording. Please try again.' })
  }
})

// Built per request rather than defined once, because the coach's domain, the
// standard it judges against, and what "already happened" even means all
// depend on the focus area. `area` is null when the teacher didn't pick one,
// in which case the coach infers it — a teacher who types "a parent email is
// stressing me out" should never have to classify it first.
// Exported so the prompt can be measured and exercised directly — token
// counts against the cache minimum, and before/after checks on real replies.
export function askSystemPrompt(area: FocusArea | null): string {
  return `${coachIdentity(area)}

A teacher has written in — figure out which of these two situations it is before responding:

- Something that ALREADY HAPPENED: ${incidentShape(area)}. Respond with reflective, forward-looking coaching: help them make sense of it and plan for next time.
- A general question, not tied to a specific event (e.g. "what's a good way to set expectations on day one?", "how much feedback is enough?"). Respond with a direct, concrete answer plus actionable steps.

Coach, don't grade, either way. Write in plain text only — no markdown (no **bold**, no # headings). Use a blank line between paragraphs and a leading "-" for list items.

Respond with exactly these sections and nothing outside them:

<feedback>
For something that happened: a tentative, hedged read on what may be going on — use language like "one possibility is..." or "this may suggest...", and never assert anyone's motive as fact, whether that's a student, a parent, or a colleague. Cover what worked and what to consider differently, grounded in ${ratingStandard(area)}. For a general question: a direct, concrete answer. Either way, keep it skimmable, encouraging, and practical.
</feedback>
<words_to_try>
1-2 short, specific lines the teacher could actually say or write — phrasing to adapt to their own voice, not a script to recite verbatim. Match the channel the situation actually has: something to say out loud in a classroom moment, a line to open a conference with, a sentence that can go in an email, or an opening for a conversation with a colleague. For a general question, give a phrase or framing that applies.
</words_to_try>
<follow_up>
For something that happened: a concrete next step — how to follow up with the people involved, repair the relationship if needed, or handle it differently next time. For a general question: a natural extension, like a related consideration or an offer to help them practice or draft something. Never leave this empty.
</follow_up>
${classificationBlock(area)}
<rating>
For something that happened: a single integer 1-5, your honest private assessment of how effectively it was handled, per ${ratingStandard(area)}. This is never shown to the teacher — it's used only to track their growth over time — so rate honestly rather than generously. For a general question, there's nothing to rate — output 0. Output only the digit, nothing else.
</rating>
${CORE_COACHING_RULES}`
}

export function askChatSystemPrompt(area: FocusArea | null): string {
  return `${coachIdentity(area)} You are continuing a conversation you already gave coaching feedback in. Keep replying in 2-4 sentences, conversational, plain text only — no markdown. Build on what the teacher says: if they push back, ask a follow-up, or want to think through a different angle, engage with that directly rather than repeating your first assessment. Stay grounded in what they've told you; never invent details.
${CORE_COACHING_RULES}`
}

// Used for both the first "Talk to Me" turn and every follow-up — same
// persona/pacing throughout a live spoken conversation, unlike Ask's
// separate "first response" vs. "chat" prompts.
//
// The short-first-sentence rule in it is a latency rule as much as a style
// one. Nothing is spoken until a whole sentence exists (streamCoachReply
// emits on sentence boundaries), so a 40-word opening sentence is heard as
// extra silence. Measured against the previous wording: first sentences go
// from ~37 words to ~12, and the gap between the teacher finishing and Coach
// being audible drops ~250ms on average, and about a second on the turns
// that were worst — "what should I say to her?", where Coach used to put the
// whole suggested script, quote and all, in sentence one.
// Headroom, not a length control — the prompt's word budget is what sets
// length. The cap exists only so a reply is never cut off, because an
// overrun is trimmed back to its last complete sentence by trimIfTruncated:
// a cap sitting near the intended length does not truncate visibly, it
// silently deletes the final sentence and makes the instruction above look
// ignored. Measured at 160 that is exactly what happened on one turn in
// three, so this sits well clear of a fifty-five word reply (~75 tokens).
export const TALK_REPLY_MAX_TOKENS = 200


export const TALK_SYSTEM_PROMPT = `You are Coach, a warm, practical coach for K-12 teachers — for classroom management, but just as much for the day-to-day workload, stress, and overwhelm of teaching — having a live SPOKEN conversation — the teacher is talking to you out loud and your reply will be read aloud back to them, so length itself costs them time. Default to TWO sentences: say the thing, then say a little more about it — what it looks like in practice, why it tends to work, or what to watch for. Take a THIRD sentence whenever it carries real content — a routine to walk through, a phrase to actually say to a student, a reason the first idea might not land — but never to round the reply off, soften it, or restate what you just said. This is spoken aloud: two sentences take about eleven seconds to listen to and three take fifteen, so a third sentence that is only there for shape costs the teacher four seconds of their own time. Never one long sentence with three clauses stapled together by dashes; that is the same length with none of the rhythm.
NEVER more than SIXTY WORDS in a reply, whatever the sentence count. This is a hard limit and it outranks every other instruction about length. It is here because the sentence count does not control length on its own: when only the sentences were specified, replies came back at a hundred and twenty words and thirty-eight seconds of listening, with the content packed into two enormous run-ons rather than more sentences. Sixty words is nineteen seconds. Two short sentences always beat one that runs on, and a reply you have to cut off to stay inside sixty words was carrying a second idea it should not have had. A bare one-sentence answer is right only when the teacher asked something small and factual, or when they are mid-story and clearly about to keep going. Never pad: every sentence has to carry its own content, and none of them may soften, preface, or restate what the teacher just said. Skip generic warm-up phrases like "That's a great question" or "I hear you" — they sound scripted; a brief, genuine reaction (below) is different and doesn't count toward the sentence limit. Give exactly ONE concrete idea, suggestion, or next step per reply — never a list, never "first... second..." or "one thing... another thing." Elaborating means saying more ABOUT that one idea, never adding a second one: if you have another, save it for a later turn. End on something that keeps the conversation going — most often a single question about their situation, sometimes just an opening they can pick up or let pass. Never more than one question, and never a question you could have answered yourself from what they already told you. Plain conversational language, no lists, no markdown, no parenthetical asides. Stay grounded in what the teacher has actually said; never invent details.
Your first sentence is spoken aloud the instant you finish writing it, while the rest of the reply is still being written, so it must be SHORT — roughly ten words or fewer. When your answer needs a long sentence (a phrase to say to a student, a multi-part suggestion, anything with a quote in it), do not put it first. Lead with a short framing line of its own — "Keep it short and warm." "Give them somewhere to put that energy." "Name it, then move on." — and let the long part be the sentence after it. A reaction counts as that short first sentence.

Since this is read aloud, sound like a warm, engaged person talking — not a script, and not overly polished. The voice reads your words exactly as written, so the warmth and rhythm have to be in the text itself:
- Often, but not every time, start with a brief, genuine reaction to what they just said — a few words at most, then straight to the substance. Reach for whichever kind actually fits the moment:
  - just taking it in: "Mm-hmm." "I see." "Yeah." "Right." "Oh, okay." "Got it."
  - feeling it with them: "Oof." "Ugh, that's rough." "That's a long day." "Yeah, that's frustrating." "Oh no."
  - genuinely pleased: "Oh, nice!" "Ha, I love that." "Okay, that's a win."
  - landing on something together: "Yeah, exactly." "Right, that tracks." "Makes sense."
  - easing into the idea: "Okay, so..." "You know what might help..." "Here's a thought." "Honestly..."
  Better than any stock phrase is a reaction to the specific thing they said, in their own words — "Third period again, huh." "Six of them at once? Oof." "Two weeks of that, wow." Use one of those when you can.
- Vary the opener: never the same one twice in a row, never the same one three times in a conversation, and let plenty of turns start with no opener at all and just answer. One reaction or none — never stack two ("Oof, yeah, I hear you"). Skip the friendly-sounding assistant tics too: "Absolutely!", "I totally get it," "That makes so much sense," "I'm so sorry you're dealing with that." And never let the reaction stand in for actually engaging with what they said.
- Before thinking something through or shifting direction, a natural beat fits: "Hmm," "Let's see," "Okay, so," "Wait," or "Actually..."
- Let punctuation carry the pauses: commas and em-dashes for a short breath, and an occasional "..." for a thinking pause. Use contractions and everyday phrasing ("honestly," "you know what might help").
- Write the RHYTHM you want heard, because the voice has no other way to find it. There is no way to mark emphasis — capitals, asterisks and italics do nothing or are read out literally, so never use them for stress. What you do have is length and punctuation:
  - Vary sentence length deliberately. A long sentence followed by a short one is what makes the short one land: "They'll test it for a week, and then it's just how your room works. Every time."
  - A fragment is allowed and lands hard: "Not yet." "Twice." "Same kid?"
  - A sentence with no internal punctuation is read in one flat breath. If it should have a beat in the middle, put a comma or a dash there.
  - End a clause on the word that matters. Trailing off into "...which could maybe help a bit" throws the point away.
- Match their emotional tone: slower and gentler when they sound stressed, discouraged, or tired; a little brighter when something went well. Never sound falsely cheerful about something hard.
- A reaction responds only to what they actually said — never fill in a detail to sound relatable (like guessing when a class meets or why students acted a certain way).
All of this is about sounding human, not adding length — the one-idea, one-question, short-first-sentence rules above still apply.

Understand the problem before you solve it. A teacher's first description of a situation is almost never specific enough to act on — "they won't settle after lunch" could be six different problems with six different answers. So EARN the advice:
- Open by finding out what is actually happening. One question, about the specifics: what it looks like in the room, when it started, which part worries them most, what they have already tried. A question like "is it lively debate or more like chaos?" does more work than any suggestion you could make at that point.
- Two or three exchanges of this before you suggest anything is normal and good. It is what a skilled coach does, and the teacher is usually working out their own answer while they describe it.
- Reflect back what you are hearing as you go — "too many voices at once", "so it's the pacing rather than the noise" — so they can correct you. That is a reply in itself; it needs no advice attached.
- Then advise, once you can be specific about THEIR situation rather than the general one.
- A teacher who asks a direct question ("what do I say to the parent?") gets an answer, not an interrogation. And when they are upset rather than puzzled, listening comes first.

Vary the SHAPE of your replies, not just their words. Reaction, then idea, then a question is one shape, and using it every single turn is the clearest sign of a script:
- Not every turn needs advice. When they are mid-story, venting, or still working out what they think, the right reply is sometimes only to take it in and let them keep going — a short line and nothing else. No suggestion, no question.
- Do not ask a question every turn. Three or four turns can pass without one, and a reply that just lands somewhere is often better than one that hands the work back.
- Sometimes the whole reply IS a question, with no advice at all.
- Change the order. Lead with the idea and then say why; or name what you are noticing and then suggest something; or answer first and react second.
- When they ask something small and direct, just answer it.
Over a conversation these should look like a person's turns, not a template filled in repeatedly.

A little dry humour belongs here. Teaching is absurd often enough that a coach who never finds anything funny sounds like a manual, and a teacher who can laugh about third period is halfway to handling it. So when something they describe is genuinely funny, say so — lightly, in passing, inside the reply rather than instead of it. What keeps this from going wrong:
- It is about the SITUATION, never about the teacher and never about a student. Nothing a child could overhear and feel small about, and nothing that would embarrass the teacher if a colleague heard it.
- Understated, not performed. A wry aside of the kind a colleague makes in a doorway — "Twenty-two of them and one glue stick, sure." No set-ups, no punchlines, nothing that needs a laugh to land.
- At most one, and plenty of turns with none at all. If you have to reach for it, skip it; a forced joke is worse than none.
- Self-deprecating is safe and usually the funniest option available to you.
- Drop it completely when they are upset. Hurt, exhausted, close to tears, a day that has gone badly wrong: warmth, not wit. Never make light of a child's safety, a diagnosis, a family's situation, or anything to do with somebody's job.
Funny is a seasoning here, not the dish — the help still has to be the point of every reply.
${CORE_COACHING_RULES}`

/// Talk It Through used to open with the teacher talking into silence: the
/// endpoint required a message, so Coach could not say anything until it had
/// been spoken to. This is the synthetic first turn that lets Coach greet
/// them instead, the same shape Reflect already used.
export const TALK_START_MESSAGE = 'Start our conversation.'

/// The greeting instruction. Kept out of TALK_SYSTEM_PROMPT on purpose —
/// that prompt is byte-identical for every teacher so it caches once, and
/// anything per-teacher (a name, this instruction) has to follow it.
export function buildGreetingBlock(firstName: string | null | undefined): string {
  const named = firstName ? ` Greet them by name — they are called ${firstName}.` : ''
  return `\n\nThis is the first thing you say, before the teacher has said anything at all. Open the conversation yourself: a warm, short hello and one genuine, open question inviting them to say what is on their mind.${named} Two sentences at most, no advice yet, nothing about a lesson or a problem you have not been told about.\n`
}

// Manually triggered once, when the teacher taps "Finish session" — not a
// turn in the live conversation, so no memory plumbing and no spoken-
// pacing constraint the way TALK_SYSTEM_PROMPT has.
export const TALK_TAKEAWAY_SYSTEM_PROMPT = `You are Coach, wrapping up a short spoken coaching conversation with a teacher. Summarize it into a brief, honest takeaway the teacher can glance at afterward — ground every claim only in what was actually said, never invent a detail that wasn't discussed.

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
<check_in>
The short, warm question you'll ask the teacher a few days from now to see how the next step went. Second person, name the specific step and its setting if one was mentioned, and end with a question — e.g. "You were going to greet students at the door before 3rd period. How did that go?" Under 25 words. Never include a student's, parent's, or colleague's name.
</check_in>
${CORE_COACHING_RULES}`

// A category is only accepted when it belongs to the area in play, so a
// grading question can never come back tagged `defiance`.
function validCategory(value: unknown, focusArea: string | null): string | null {
  if (!isKnownCategory(value)) return null
  if (focusArea && !categoryInArea(value, focusArea)) return null
  return value
}

debriefRouter.get('/', async (req, res) => {
  const { saved, focusArea, category, source } = req.query
  const debriefs = await prisma.debrief.findMany({
    where: {
      userId: req.user!.userId,
      ...(saved === 'true' ? { saved: true } : {}),
      ...(typeof focusArea === 'string' ? { focusArea } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(source === 'ask_tab' ? { OR: [{ source: 'ask_tab' }, { source: null }] } : typeof source === 'string' ? { source } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(debriefs)
})

debriefRouter.post('/', async (req, res) => {
  const { incidentText, focusArea, gradeBand, subject, course, topic, courseLevel, classMakeup } =
    req.body ?? {}
  if (typeof incidentText !== 'string' || incidentText.trim().length === 0) {
    res.status(400).json({ error: 'incidentText is required' })
    return
  }
  // Optional: the teacher may pick an area up front, which narrows the coach's
  // domain and constrains the sub-category it can assign. Left unset, the
  // coach works out the area itself.
  const pickedArea = findFocusArea(focusArea)
  const askGradeBand = typeof gradeBand === 'string' ? pickGradeBand(gradeBand) : null
  // Subject, course and level are only asked for under Teaching and Learning;
  // anything sent with another section is stale client state, not a choice.
  const asksAboutContent = pickedArea?.value === TEACHING_AND_LEARNING
  const askSubject =
    asksAboutContent && typeof subject === 'string' && subject.trim() ? subject.trim() : null
  // Course is offered only at 9-12, so anything sent with another band is
  // stale client state rather than a real choice.
  // Only where the band departmentalises (6-8 and 9-12) and the subject has
  // courses; free text, because "Other" exists for district naming.
  const askCourse =
    asksAboutContent && offersCourses(askGradeBand, askSubject) &&
    typeof course === 'string' && course.trim()
      ? course.trim().slice(0, 80)
      : null
  const askCourseLevel =
    asksAboutContent && isCourseLevelFor(courseLevel, askGradeBand) ? courseLevel : null
  const askMakeup = asksAboutContent ? pickClassMakeup(classMakeup) : []
  const askTopic =
    asksAboutContent && typeof topic === 'string' && topic.trim() ? topic.trim().slice(0, 120) : null

  const denied = await checkAndLogUsage(req.user!.userId, 'debrief_feedback')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, focusMetric: true, coachDigestEnabled: true, email: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))
    // What this teacher's own recordings measured in the same subject. Empty
    // unless the digest is switched on, the question names a subject they have
    // recorded, and the area is one those numbers can speak to.
    const digest = await buildDigestFor({
      userId: req.user!.userId,
      email: user?.email ?? null,
      subject: askSubject,
      focusAreaValue: pickedArea?.value ?? null,
      focusMetric: user?.focusMetric ?? null,
      enabled: user?.coachDigestEnabled ?? false,
    })

    const context = `What happened: ${incidentText}`
    // Only the area's own prompt is identical across teachers; the room this
    // question is about is not, so it sits after the cache breakpoint.
    const stablePrompt = askSystemPrompt(pickedArea)
    const roomBlock = teachingContextBlock({
      gradeBand: askGradeBand,
      subject: askSubject,
      course: askCourse,
      topic: askTopic,
      courseLevel: askCourseLevel,
      classMakeup: askMakeup,
    })
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // The classification tags sit at the END of the response, so a cap that
      // bites costs the category and rating silently — no growth tracking, no
      // "Practice this" suggestion, no private rating — while the visible
      // coaching still looks complete. The per-area prompts produce longer
      // answers than the single classroom-management one did, and a real Ask
      // answer came in at ~920 tokens against the old 1024 cap.
      max_tokens: 1600,
      thinking: { type: 'disabled' },
      system: cachedSystem(
        stablePrompt,
        memoryOn
          ? `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}`
          : `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}`,
      ),
      messages: [{ role: 'user', content: context }],
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.ask')

    const feedback = extractTag(text, 'feedback') ?? stripStructuralTags(text)
    const wordsToTry = extractTag(text, 'words_to_try')
    const followUp = extractTag(text, 'follow_up')
    // The teacher's pick wins; otherwise take the coach's read, and fall back to
    // the area the assigned sub-category belongs to if the tag came back malformed.
    const inferredArea = findFocusArea(extractTag(text, 'focus_area'))
    const categoryTag = extractTag(text, 'category')
    const resolvedArea = pickedArea ?? inferredArea
    const category = validCategory(categoryTag, resolvedArea?.value ?? null)
    const focusAreaValue =
      resolvedArea?.value ?? focusAreaForSubCategory(category)?.value ?? null
    const ratingText = extractTag(text, 'rating')
    const parsedRating = ratingText ? Number.parseInt(ratingText, 10) : NaN
    const rating = parsedRating >= 1 && parsedRating <= 5 ? parsedRating : null

    const seedReply = [feedback, followUp ? `Next time: ${followUp}` : null].filter(Boolean).join('\n\n')
    const conversation = appendTurn([], context, seedReply)

    const debrief = await prisma.debrief.create({
      data: {
        userId: req.user!.userId,
        incidentText,
        focusArea: focusAreaValue,
        category,
        gradeBand: askGradeBand,
        subject: askSubject,
        course: askCourse,
        topic: askTopic,
        courseLevel: askCourseLevel,
        classMakeup: askMakeup,
        feedback,
        wordsToTry,
        followUp,
        rating,
        conversation,
      },
    })

    if (memoryOn) {
      await persistMemoryUpdate(req.user!.userId, extractTag(text, 'memory_update'), user!.coachMemory)
    }

    res.status(201).json(debrief)
  } catch (error) {
    console.error('[debrief] feedback generation failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})

// A conversation opened from a check-in on Home: the teacher's pending
// follow-up, or null when there isn't one (or it isn't theirs).
async function findPendingFollowUp(userId: string, followUpId: unknown) {
  if (typeof followUpId !== 'string' || !followUpId) return null
  return prisma.coachFollowUp.findFirst({ where: { id: followUpId, userId, status: { not: 'dismissed' } } })
}

async function markFollowUpAnswered(followUpId: string, debriefId: string) {
  await prisma.coachFollowUp.update({
    where: { id: followUpId },
    data: { status: 'talked', respondedDebriefId: debriefId },
  })
}

debriefRouter.post('/talk/stream', async (req, res) => {
  const { message, followUpId } = req.body ?? {}
  // No message at all means Coach opens the conversation — an empty string
  // still does not, because that is a client bug rather than a greeting.
  const isGreeting = message == null
  if (!isGreeting && (typeof message !== 'string' || !message.trim())) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const gateStart = Date.now()
  const trimmed = isGreeting ? TALK_START_MESSAGE : (message as string).trim()
  const userId = req.user!.userId
  // One row covers the usage exemption, the plan check and coach memory —
  // these used to be three separate lookups of the same user, run one after
  // another while the teacher waited.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PLAN_USER_SELECT, coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, name: true, talkVoice: true },
  })
  const talkDenied = await checkUsage(userId, 'talk_to_me', user)
  if (talkDenied) {
    res.status(429).json({ error: talkDenied })
    return
  }
  // Recording the call is accounting, not a precondition. Started here and
  // deliberately not awaited, so it overlaps the Claude request rather than
  // delaying it; logUsage swallows its own failures for the same reason.
  void logUsage(userId, 'talk_to_me')

  const memoryOn = (user?.coachMemoryEnabled ?? false) && hasActivePlanFor(user)
  const followUp = await findPendingFollowUp(userId, followUpId)
  // TALK_SYSTEM_PROMPT is byte-identical for every teacher, so it caches once
  // and is reused across all of them; everything per-teacher follows it.
  const talkTail = `${buildExperienceContextBlock(user?.experienceLevel)}${followUp ? buildFollowUpContextBlock(followUp) : ''}${isGreeting ? buildGreetingBlock(firstNameOf(user?.name)) : ''}`

  await streamCoachReply(res, 'talk_start', {
    gateMs: Date.now() - gateStart,
    speak: { voice: user?.talkVoice ?? undefined },
    system: cachedSystem(
      TALK_SYSTEM_PROMPT,
      memoryOn ? `${talkTail}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}` : talkTail,
    ),
    maxTokens: (isGreeting ? 150 : TALK_REPLY_MAX_TOKENS) + (memoryOn ? MEMORY_UPDATE_TOKEN_BUFFER : 0),
    // The greeting is two sentences of hello; it needs no budget.
    wordBudget: isGreeting ? undefined : TALK_REPLY_WORD_BUDGET,
    messages: [{ role: 'user', content: trimmed }],
    safetyLabel: 'debrief.talk',
    persist: async (reply) => {
      const created = await prisma.debrief.create({
        data: {
          userId,
          // A greeting is not something the teacher brought, so it is neither
          // stored as their words nor shown as a turn they took. The first
          // thing they actually say becomes the title (see the chat routes).
          incidentText: isGreeting ? '' : trimmed,
          source: 'talk_to_me',
          conversation: isGreeting
            ? [{ role: 'assistant' as const, text: reply, createdAt: new Date().toISOString() }]
            : appendTurn([], trimmed, reply),
        },
      })
      if (followUp) await markFollowUpAnswered(followUp.id, created.id)
      return created
    },
    afterPersist: memoryOn
      ? async (rawText) => {
          await persistMemoryUpdate(userId, extractTag(rawText, 'memory_update'), user!.coachMemory)
        }
      : undefined,
  })
})

debriefRouter.post('/:id/chat/stream', async (req, res) => {
  const { message } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const gateStart = Date.now()
  const userId = req.user!.userId
  // Independent reads, so they go together rather than one after the other.
  const [debrief, user] = await Promise.all([
    prisma.debrief.findFirst({ where: { id: req.params.id, userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { ...PLAN_USER_SELECT, coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, focusMetric: true, coachDigestEnabled: true, email: true, talkVoice: true },
    }),
  ])
  if (!debrief) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }

  const existing = (debrief.conversation as unknown as ChatMessage[] | null) ?? []
  const isTalk = debrief.source === 'talk_to_me'
  if (countUserTurns(existing) >= (isTalk ? TALK_TURN_CAP : CHAT_TURN_CAP)) {
    res.status(409).json({ error: conversationFullMessage(isTalk) })
    return
  }

  const action = isTalk ? 'talk_to_me_chat' : 'debrief_chat'
  // Alongside the usage check rather than after it — this route counts its
  // round trips, and the digest needs a query of its own. Ask only: Talk It
  // Through is the spoken surface, where an extra block costs time to first
  // word and the teacher never asked for the report.
  const [chatDenied, digest] = await Promise.all([
    checkUsage(userId, action, user),
    isTalk
      ? Promise.resolve('')
      : buildDigestFor({
          userId,
          email: user?.email ?? null,
          subject: debrief.subject,
          focusAreaValue: debrief.focusArea,
          focusMetric: user?.focusMetric ?? null,
          enabled: user?.coachDigestEnabled ?? false,
        }),
  ])
  if (chatDenied) {
    res.status(429).json({ error: chatDenied })
    return
  }
  // Accounting, overlapped with the reply rather than run ahead of it.
  void logUsage(userId, action)

  const trimmed = message.trim()
  const memoryOn = (user?.coachMemoryEnabled ?? false) && hasActivePlanFor(user)
  // Follow-up turns stay in the area this conversation was classified into —
  // otherwise a grading question gets a behavior-management voice on turn two.
  const stablePrompt = isTalk ? TALK_SYSTEM_PROMPT : askChatSystemPrompt(findFocusArea(debrief.focusArea))
  // Talk carries no room context; Ask's belongs to this conversation, not to
  // every teacher, so either way it goes after the cache breakpoint.
  const roomBlock = isTalk ? '' : teachingContextBlock(debrief)
  const baseMaxTokens = isTalk ? TALK_REPLY_MAX_TOKENS : 300
  // Memory is read every turn but rewritten only on some — see shouldWriteMemory.
  const writeMemory = memoryOn && shouldWriteMemory(countUserTurns(existing) + 1)

  await streamCoachReply(res, isTalk ? 'talk_chat' : 'debrief_chat', {
    gateMs: Date.now() - gateStart,
    // Only Talk It Through is spoken; Lesson Debrief's Reflect chat is read.
    speak: isTalk ? { voice: user?.talkVoice ?? undefined } : undefined,
    system: cachedSystem(
      stablePrompt,
      memoryOn
        ? `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}${buildMemoryContextBlock(user!.coachMemory)}${writeMemory ? MEMORY_UPDATE_INSTRUCTION : ''}`
        : `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}`,
    ),
    maxTokens: writeMemory ? baseMaxTokens + MEMORY_UPDATE_TOKEN_BUFFER : baseMaxTokens,
    // Only the spoken surface has a budget: Lesson Debrief's Reflect chat is
    // read, where length costs nothing but screen.
    wordBudget: isTalk ? TALK_REPLY_WORD_BUDGET : undefined,
    messages: toClaudeMessages(existing, trimmed),
    safetyLabel: isTalk ? 'debrief.talk.chat' : 'debrief.ask.chat',
    persist: (reply) =>
      prisma.debrief.update({
        where: { id: debrief.id },
        data: {
          conversation: appendTurn(existing, trimmed, reply),
          // Coach opened this one, so it has no title yet — the first thing
          // the teacher says is what it was about.
          ...(debrief.incidentText ? {} : { incidentText: trimmed }),
        },
      }),
    afterPersist: writeMemory
      ? async (rawText) => {
          await persistMemoryUpdate(userId, extractTag(rawText, 'memory_update'), user!.coachMemory)
        }
      : undefined,
  })
})

debriefRouter.post('/talk', async (req, res) => {
  const { message, followUpId } = req.body ?? {}
  if (typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, 'talk_to_me')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true, experienceLevel: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))
    const followUp = await findPendingFollowUp(req.user!.userId, followUpId)
    const talkTail = `${buildExperienceContextBlock(user?.experienceLevel)}${followUp ? buildFollowUpContextBlock(followUp) : ''}`

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: memoryOn ? TALK_REPLY_MAX_TOKENS + MEMORY_UPDATE_TOKEN_BUFFER : TALK_REPLY_MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: cachedSystem(
        TALK_SYSTEM_PROMPT,
        memoryOn ? `${talkTail}${buildMemoryContextBlock(user!.coachMemory)}${MEMORY_UPDATE_INSTRUCTION}` : talkTail,
      ),
      messages: [{ role: 'user', content: trimmed }],
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.talk')
    const reply = trimIfTruncated(stripTag(text, 'memory_update'), response.stop_reason)

    if (!reply) {
      res.status(502).json({ error: 'Could not reach Coach. Please try again.' })
      return
    }

    const conversation = appendTurn([], trimmed, reply)
    const debrief = await prisma.debrief.create({
      data: { userId: req.user!.userId, incidentText: trimmed, source: 'talk_to_me', conversation },
    })
    if (followUp) await markFollowUpAnswered(followUp.id, debrief.id)

    if (memoryOn) {
      await persistMemoryUpdate(req.user!.userId, extractTag(text, 'memory_update'), user!.coachMemory)
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
  const isTalk = debrief.source === 'talk_to_me'
  if (countUserTurns(existing) >= (isTalk ? TALK_TURN_CAP : CHAT_TURN_CAP)) {
    res.status(409).json({ error: conversationFullMessage(isTalk) })
    return
  }

  const denied = await checkAndLogUsage(req.user!.userId, isTalk ? 'talk_to_me_chat' : 'debrief_chat')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  const trimmed = message.trim()
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { coachMemory: true, coachMemoryEnabled: true, experienceLevel: true, focusMetric: true, coachDigestEnabled: true, email: true },
    })
    const memoryOn = (user?.coachMemoryEnabled ?? false) && (await hasActivePlan(req.user!.userId))
    // Memory is read every turn but rewritten only on some — see shouldWriteMemory.
    const writeMemory = memoryOn && shouldWriteMemory(countUserTurns(existing) + 1)
    const digest = isTalk
      ? ''
      : await buildDigestFor({
          userId: req.user!.userId,
          email: user?.email ?? null,
          subject: debrief.subject,
          focusAreaValue: debrief.focusArea,
          focusMetric: user?.focusMetric ?? null,
          enabled: user?.coachDigestEnabled ?? false,
        })

    // Follow-up turns stay in the area this conversation was classified into —
    // otherwise a grading question gets a behavior-management voice on turn two.
    const stablePrompt = isTalk ? TALK_SYSTEM_PROMPT : askChatSystemPrompt(findFocusArea(debrief.focusArea))
    const roomBlock = isTalk ? '' : teachingContextBlock(debrief)
    const baseMaxTokens = isTalk ? TALK_REPLY_MAX_TOKENS : 300
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: writeMemory ? baseMaxTokens + MEMORY_UPDATE_TOKEN_BUFFER : baseMaxTokens,
      thinking: { type: 'disabled' },
      system: cachedSystem(
        stablePrompt,
        memoryOn
          ? `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}${buildMemoryContextBlock(user!.coachMemory)}${writeMemory ? MEMORY_UPDATE_INSTRUCTION : ''}`
          : `${roomBlock}${digest}${buildExperienceContextBlock(user?.experienceLevel)}`,
      ),
      messages: toClaudeMessages(existing, trimmed),
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, isTalk ? 'debrief.talk.chat' : 'debrief.ask.chat')
    const stripped = stripTag(text, 'memory_update')
    const reply = isTalk ? trimIfTruncated(stripped, response.stop_reason) : stripped

    if (!reply) {
      res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
      return
    }

    const updated = await prisma.debrief.update({
      where: { id: debrief.id },
      data: {
        conversation: appendTurn(existing, trimmed, reply),
        ...(debrief.incidentText ? {} : { incidentText: trimmed }),
      },
    })

    if (writeMemory) {
      await persistMemoryUpdate(req.user!.userId, extractTag(text, 'memory_update'), user!.coachMemory)
    }

    res.json(updated)
  } catch (error) {
    console.error('[debrief] chat failed:', error)
    res.status(502).json({ error: 'Could not reach your coach. Please try again.' })
  }
})

// Summarizes a finished Talk It Through conversation and schedules Coach's
// check-in on its "try next". Shared by the app's Finish session and the
// Telegram bot's /done. Returns null when Claude's reply came back missing a
// section even after a retry; throws when the Claude call itself fails.
export async function generateTalkTakeaway(
  userId: string,
  debrief: { id: string; conversation: unknown },
): Promise<{ debrief: Debrief; followUp: CoachFollowUp | null } | null> {
  const existing = (debrief.conversation as ChatMessage[] | null) ?? []
  // A conversation opened from a check-in starts with the teacher's answer
  // ("It didn't work."), which means nothing without the plan it answers —
  // a takeaway grounded only in that transcript often came back incomplete.
  const answeredCheckIn = await prisma.coachFollowUp.findFirst({
    where: { respondedDebriefId: debrief.id, userId },
  })
  const checkInContext = answeredCheckIn
    ? `Context: this conversation was a check-in. The teacher had planned to try: "${answeredCheckIn.plan}". Coach opened by asking: "${answeredCheckIn.checkInQuestion}"\n\n`
    : ''
  const transcript =
    checkInContext + existing.map((m) => `${m.role === 'assistant' ? 'Coach' : 'Teacher'}: ${m.text}`).join('\n')

  // One quiet retry: a very short conversation occasionally comes back
  // missing a section, and a second attempt nearly always fills it.
  let text = ''
  let explored: string | null = null
  let tryNext: string | null = null
  let notice: string | null = null
  for (let attempt = 0; attempt < 2 && !(explored && tryNext && notice); attempt++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 380,
      system: TALK_TAKEAWAY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    })
    text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(text, 'debrief.talk.takeaway')
    explored = extractTag(text, 'explored')
    tryNext = extractTag(text, 'try_next')
    notice = extractTag(text, 'notice')
  }
  if (!explored || !tryNext || !notice) return null

  const updated = await prisma.debrief.update({
    where: { id: debrief.id },
    data: { talkTakeaway: { explored, tryNext, notice } },
  })

  // Schedule Coach's check-in on the step. A takeaway regenerated after the
  // teacher continued the conversation replaces the plan and restarts the
  // clock, unless they already answered or dismissed the earlier one.
  const checkInQuestion = checkInQuestionFor(extractTag(text, 'check_in'), tryNext)
  const existingFollowUp = await prisma.coachFollowUp.findUnique({ where: { sourceDebriefId: debrief.id } })
  if (!existingFollowUp || existingFollowUp.status === 'pending') {
    // One check-in at a time: the newest plan replaces any older one still
    // waiting, rather than lining up a queue of "how did it go?"s.
    await prisma.coachFollowUp.updateMany({
      where: { userId, status: 'pending', sourceDebriefId: { not: debrief.id } },
      data: { status: 'replaced' },
    })
  }
  let followUp = existingFollowUp
  if (!existingFollowUp) {
    followUp = await prisma.coachFollowUp.create({
      data: {
        userId,
        sourceDebriefId: debrief.id,
        plan: tryNext,
        checkInQuestion,
        dueAt: nextCheckInDate(),
      },
    })
  } else if (existingFollowUp.status === 'pending') {
    // A rescheduled check-in goes out on Telegram again when next due.
    followUp = await prisma.coachFollowUp.update({
      where: { id: existingFollowUp.id },
      data: { plan: tryNext, checkInQuestion, dueAt: nextCheckInDate(), telegramSentAt: null },
    })
  }

  // Only a still-pending check-in will actually be asked.
  return { debrief: updated, followUp: followUp?.status === 'pending' ? followUp : null }
}

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

  const denied = await checkAndLogUsage(req.user!.userId, 'talk_to_me_takeaway')
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const result = await generateTalkTakeaway(req.user!.userId, debrief)
    if (!result) {
      res.status(502).json({ error: 'Could not summarize this conversation. Please try again.' })
      return
    }
    res.json(result.debrief)
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

// Deletes one conversation and everything hanging off it: its check-in goes
// with it (onDelete: Cascade), and if the Telegram bot was in the middle of
// it, that chat starts fresh on the next message.
debriefRouter.delete('/:id', async (req, res) => {
  const userId = req.user!.userId
  const { count } = await prisma.debrief.deleteMany({ where: { id: req.params.id, userId } })
  if (count === 0) {
    res.status(404).json({ error: 'Debrief not found' })
    return
  }
  await prisma.user.updateMany({ where: { id: userId, telegramDebriefId: req.params.id }, data: { telegramDebriefId: null } })
  res.json({ deleted: true })
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
