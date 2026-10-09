// "This belongs in another tool."
//
// A teacher texting Coach has not chosen a tool — there is no nav in a chat.
// Most of what they send is exactly what Talk It Through is for, and Coach
// should just answer it. But some of it has a better home: a lesson to
// build, an assignment to interrogate, a message to write, a class worth
// recording.
//
// Rather than a second Claude call to classify every message, the reply
// itself may carry one <better_tool> tag — the same trick as
// <memory_update> in coachMemory.ts. No extra call, no extra latency, and a
// suggestion only ever rides along with a real answer.
//
// The tag never replaces the reply. Coach still answers; the offer is a
// button underneath it.

import { extractTag, stripTag } from './extractTag.ts'

const TAG = 'better_tool'
const DETAILS_TAG = 'tool_details'

export type ToolKey = 'lesson_debrief' | 'practice' | 'planning_coach' | 'assignment_coach' | 'communication_coach'

export type ToolOffer = { key: ToolKey; label: string; prefillLabel?: string; path: string }

/// What Coach already knows about what the teacher wants to make, for
/// filling in the tool's form. Deliberately the fields Build a Lesson asks
/// for (see readBuildContext in routes/lessonPlans.ts) and no more.
export type HandoffDetails = {
  topic: string
  subject?: string
  gradeLevel?: string
  durationMinutes?: number
  kind?: 'full' | 'ideas'
}

// `when` is prompt-facing: it is what Claude reads to decide. `label` is the
// button a teacher taps, `path` where it opens in the app.
const TOOLS: Record<ToolKey, { label: string; prefillLabel?: string; path: string; when: string }> = {
  lesson_debrief: {
    label: 'Open Lesson Debrief',
    path: '/audio-coaching',
    when: 'they want to know what a lesson actually sounded like — who talked, which questions they asked, how long they waited. It works from a recording of the class, so offer it for a lesson still to come, never as a way to analyse the one they have just described to you.',
  },
  practice: {
    label: 'Open Practice',
    path: '/coach-chat',
    when: 'they want to rehearse what to SAY in a moment they are dreading or handled badly — the actual words, with coaching on them. Hypothetical situations only.',
  },
  planning_coach: {
    label: 'Open Planning Coach',
    // The only tool whose form Coach can fill from a conversation, so the
    // only one whose button promises to build something.
    prefillLabel: 'Build this lesson',
    path: '/lesson-planning',
    when: 'they need to build or fix something they are about to teach — a lesson, a sequence, slides, a warm-up, a re-teach.',
  },
  assignment_coach: {
    label: 'Open Assignment Coach',
    path: '/lesson-planning?tab=assignment',
    when: 'they have an assignment, worksheet, project or test and want to know whether it measures what they think it measures, how rigorous it is, or how much of it a chatbot could do for a student.',
  },
  communication_coach: {
    label: 'Open Communication Coach',
    path: '/communications',
    when: 'they have to write a message, or walk into a real conversation with a parent, student, colleague or administrator, and want help with the wording or with how to go in.',
  },
}

const TOOL_LINES = (Object.entries(TOOLS) as [ToolKey, (typeof TOOLS)[ToolKey]][])
  .map(([key, tool]) => `- ${key}: ${tool.when}`)
  .join('\n')

// Appended to the system prompt only on a turn where an offer is allowed —
// see telegramCoach.ts. "Most replies should have no tag" is load-bearing:
// without it Coach tags nearly everything, because being helpful is what it
// is for, and a button under every message is a nag.
export const BETTER_TOOL_INSTRUCTION = `

Wivoza has other tools besides this chat, and the teacher is texting you without having picked one. Most of what they send belongs right here — keep answering it. But when what they have just described would be better served by one of these, end your reply with a tag, after your last sentence:

<${TAG}>key</${TAG}>

The keys, and when each one fits:
${TOOL_LINES}

Rules for the tag:
- Answer them first, in full, exactly as you normally would. The tag is an offer underneath your reply, not a redirection — never send them elsewhere instead of helping, and don't name the tool in your reply text: it becomes a button that names itself.
- At most one tag, and only for a concrete thing they want to make or find out. Thinking out loud, venting, a hard day, or any question you can simply answer gets no tag.
- The tag carries nothing but the key — neither your reply nor anything the teacher wrote is sent anywhere, and the button opens an empty tool. So a message a parent sent them is a good reason to offer communication_coach, not a reason to stay quiet.
- Most replies should have no tag. A reply with no tag is the normal case.
- When you tag planning_coach, make your reply a real choice rather than a handover: they can have the lesson built out now, or work out the shape of it with you here first. Ask which they'd rather, in your own words.

When — and only when — you tag planning_coach, also pass on what the teacher has already told you about the lesson, so the tool opens with its form filled in instead of empty. Put this after the tag, one field per line, leaving out any line you don't know:

<tool_details>
topic: what they're teaching, in their own words
subject: e.g. Science
grade: e.g. 7th
minutes: how long the lesson is, digits only
kind: full for a whole lesson plan, ideas for a handful of activities
</tool_details>

Only the topic line matters. Fill the rest in from what they have ALREADY said — never ask a run of questions to complete it, and never put down a grade, subject or length they haven't mentioned. You still ask at most one question per reply, exactly as before.`

// Room for the tag so that adding one cannot cost the teacher a sentence.
export const BETTER_TOOL_TOKEN_BUFFER = 20

/// Splits a raw reply into what the teacher reads and which tool (if any)
/// Coach offered.
///
/// The tag is taken out whether or not it names a real tool: a hallucinated
/// key means no button, never markup in a teacher's chat.
export function readBetterTool(raw: string): { offer: ToolOffer | null; details: HandoffDetails | null; text: string } {
  const text = stripTag(stripTag(raw, TAG), DETAILS_TAG)
  const key = extractTag(raw, TAG)?.trim().toLowerCase()
  if (!key || !Object.hasOwn(TOOLS, key)) return { offer: null, details: null, text }
  const tool = TOOLS[key as ToolKey]
  return {
    offer: { key: key as ToolKey, label: tool.label, prefillLabel: tool.prefillLabel, path: tool.path },
    details: readToolDetails(raw),
    text,
  }
}

// Line-based "key: value", not JSON. A model mangles JSON far more often
// than it mangles lines, and a mangled line costs one field rather than the
// whole prefill. Unknown keys are ignored; a value that doesn't make sense
// is dropped, never passed through.
const DETAIL_KEYS = ['topic', 'subject', 'grade', 'minutes', 'kind'] as const

const MAX_TOPIC_CHARS = 300
const MAX_SHORT_CHARS = 60

function readToolDetails(raw: string): HandoffDetails | null {
  const block = extractTag(raw, DETAILS_TAG)
  if (!block) return null

  const found = new Map<string, string>()
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i)
    if (!match) continue
    const key = match[1].toLowerCase()
    if ((DETAIL_KEYS as readonly string[]).includes(key)) found.set(key, match[2])
  }

  // Without a topic there is nothing to prefill: the form's own one required
  // field would still be empty, which is the problem this exists to fix.
  const topic = found.get('topic')?.slice(0, MAX_TOPIC_CHARS).trim()
  if (!topic) return null

  const minutes = Number.parseInt(found.get('minutes') ?? '', 10)
  const kind = found.get('kind')?.trim().toLowerCase()
  return {
    topic,
    subject: found.get('subject')?.slice(0, MAX_SHORT_CHARS).trim() || undefined,
    gradeLevel: found.get('grade')?.slice(0, MAX_SHORT_CHARS).trim() || undefined,
    // A lesson is not 4 minutes and not 9 hours; anything outside that is a
    // misread, and the form's own default is better than a wrong number.
    durationMinutes: Number.isInteger(minutes) && minutes >= 10 && minutes <= 180 ? minutes : undefined,
    kind: kind === 'ideas' || kind === 'full' ? kind : undefined,
  }
}
