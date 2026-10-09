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

export type ToolKey = 'lesson_debrief' | 'practice' | 'planning_coach' | 'assignment_coach' | 'communication_coach'

export type ToolOffer = { key: ToolKey; label: string; path: string }

// `when` is prompt-facing: it is what Claude reads to decide. `label` is the
// button a teacher taps, `path` where it opens in the app.
const TOOLS: Record<ToolKey, { label: string; path: string; when: string }> = {
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
- Answer them first, in full, exactly as you normally would. The tag is an offer underneath your reply, not a redirection — never send them elsewhere instead of helping, and never name the tool in your reply text.
- At most one tag, and only for a concrete thing they want to make or find out. Thinking out loud, venting, a hard day, or any question you can simply answer gets no tag.
- The tag carries nothing but the key — neither your reply nor anything the teacher wrote is sent anywhere, and the button opens an empty tool. So a message a parent sent them is a good reason to offer communication_coach, not a reason to stay quiet.
- Most replies should have no tag. A reply with no tag is the normal case.`

// Room for the tag so that adding one cannot cost the teacher a sentence.
export const BETTER_TOOL_TOKEN_BUFFER = 20

/// Splits a raw reply into what the teacher reads and which tool (if any)
/// Coach offered.
///
/// The tag is taken out whether or not it names a real tool: a hallucinated
/// key means no button, never markup in a teacher's chat.
export function readBetterTool(raw: string): { offer: ToolOffer | null; text: string } {
  const text = stripTag(raw, TAG)
  const key = extractTag(raw, TAG)?.trim().toLowerCase()
  if (!key || !Object.hasOwn(TOOLS, key)) return { offer: null, text }
  const tool = TOOLS[key as ToolKey]
  return { offer: { key: key as ToolKey, label: tool.label, path: tool.path }, text }
}
