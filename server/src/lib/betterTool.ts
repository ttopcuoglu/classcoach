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

import {
  isValidMessageFormat,
  isValidMessagePurpose,
  isValidMessageTone,
  isValidRecipientType,
  isValidMeetingFormat,
  isValidMeetingType,
  MEETING_FORMATS,
  MEETING_TYPES,
  MESSAGE_FORMATS,
  MESSAGE_PURPOSES,
  MESSAGE_TONES,
  RECIPIENT_TYPES,
  type MeetingFormat,
  type MeetingType,
  type MessageFormat,
  type MessagePurpose,
  type MessageTone,
  type RecipientType,
} from './communicationOptions.ts'
import { extractTag, stripTag } from './extractTag.ts'

const TAG = 'better_tool'
const DETAILS_TAG = 'tool_details'

export type ToolKey = 'lesson_debrief' | 'practice' | 'planning_coach' | 'assignment_coach' | 'communication_coach'

export type ToolOffer = { key: ToolKey; label: string; path: string }

/// What Coach already knows about what the teacher wants to make, for
/// filling in the tool's form. One shape per tool that has a form Coach
/// can fill; the tool key stored beside it says which one this is.
///
/// Deliberately the fields each form actually asks for and no more — see
/// readBuildContext in routes/lessonPlans.ts and buildContext in
/// routes/parentMessage.ts.
export type PlanningDetails = {
  topic: string
  subject?: string
  gradeLevel?: string
  durationMinutes?: number
  kind?: 'full' | 'ideas'
}

export type MessageDetails = {
  mode: 'message'
  // What happened and what they need to say — or, when answering, what the
  // other person said. Goes in the one field the form requires.
  situation: string
  startingAction: 'new' | 'respond'
  recipient?: RecipientType
  purpose?: MessagePurpose
  tone?: MessageTone
  format?: MessageFormat
}

// The other half of Communication Coach: a conversation they'll be in,
// not something they'll send. Its form branches on one person vs a
// scheduled meeting, which `meetingType` decides.
export type MeetingDetails = {
  mode: 'meeting'
  situation: string
  recipient?: RecipientType
  meetingType?: MeetingType
  meetingFormat?: MeetingFormat
  desiredOutcome?: string
  concerns?: string
}

// Not written by Claude in a <tool_details> block like the others — an
// assignment's text is far too long for a chat reply's budget. The server
// fills this in itself, by reading the photo a second time once Coach has
// said that's what it is. See telegramCoach.ts.
export type AssignmentDetails = { originalText: string }

export type HandoffDetails = PlanningDetails | MessageDetails | MeetingDetails | AssignmentDetails

/// Where a prefilled offer should land and what its button should say.
///
/// Decided by the details rather than the tool, because Communication
/// Coach has two forms behind it and only the collected fields say which
/// one the teacher is heading for. Null when there is nothing to prefill.
export function prefillTarget(details: HandoffDetails | null): { label: string; path: string } | null {
  if (!details) return null
  if ('originalText' in details) return { label: 'Review this assignment', path: '/lesson-planning?tab=assignment' }
  if ('topic' in details) return { label: 'Build this lesson', path: '/lesson-planning' }
  if (details.mode === 'meeting') return { label: 'Get ready for this', path: '/communications?tool=prepare' }
  return { label: 'Write this message', path: '/communications?tool=write' }
}

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
- Answer them first, in full, exactly as you normally would. The tag is an offer underneath your reply, not a redirection — never send them elsewhere instead of helping, and don't name the tool in your reply text: it becomes a button that names itself.
- At most one tag, and only for a concrete thing they want to make or find out. Thinking out loud, venting, a hard day, or any question you can simply answer gets no tag.
- The tag carries nothing but the key — neither your reply nor anything the teacher wrote is sent anywhere, and the button opens an empty tool. So a message a parent sent them is a good reason to offer communication_coach, not a reason to stay quiet.
- Most replies should have no tag. A reply with no tag is the normal case.
- Never send a tag on its own. There must always be words for them to read first, even when they have just said yes and there is nothing left to ask — a line agreeing with them is a reply; a tag by itself is a blank message.
- When you tag planning_coach, make your reply a real choice rather than a handover: they can have the lesson built out now, or work out the shape of it with you here first. Ask which they'd rather, in your own words.

When you tag planning_coach or communication_coach, also pass on what the teacher has already told you, so the tool opens with its form filled in instead of empty. Put this after the tag, one field per line, leaving out any line you don't know.

For planning_coach:

<tool_details>
topic: what they're teaching, in their own words
subject: e.g. Science
grade: e.g. 7th
minutes: how long the lesson is, digits only
kind: full for a whole lesson plan, ideas for a handful of activities
</tool_details>

With kind: ideas the activities come back to them right here in the chat, and they can have them as a printable PDF — so when they ask for something to print, the answer is yes. A full lesson opens in Wivoza instead, where they can print it from the page.

For communication_coach, when it's something they have to write or answer:

<tool_details>
mode: message
situation: what happened and what they need to get across, written the way they would type it into a form — or, if you have the other person's actual words, those words themselves
action: respond only when you have what the other person actually wrote, word for word, because that field is read as their message. Otherwise new, even when the thing they're writing IS a reply — then say so in the situation.
recipient: ${RECIPIENT_TYPES.join(' | ')}
purpose: ${MESSAGE_PURPOSES.join(' | ')}
tone: ${MESSAGE_TONES.join(' | ')}
format: ${MESSAGE_FORMATS.join(' | ')}
</tool_details>

For communication_coach, when instead it's a conversation they'll be in — face to face, on a call, or a scheduled meeting:

<tool_details>
mode: meeting
situation: what the conversation is about and what's at stake for them
recipient: who they're talking to, for a one-to-one: ${RECIPIENT_TYPES.join(' | ')}
meeting_type: for a scheduled meeting instead of a one-to-one: ${MEETING_TYPES.join(' | ')}
setting: ${MEETING_FORMATS.join(' | ')}
outcome: what they want to walk out of it with
worry: what they're afraid will happen
</tool_details>

Use recipient or meeting_type, not both: recipient for one person, meeting_type when several people are sitting down together.

Only the first line of each — topic, or situation — is required to offer at all.

For planning_coach, though, find out what would actually change the lesson before you offer to have it made: how long they have, and what they've already got or already covered. A lesson built from a topic and nothing else is the generic one they could have found anywhere. One question per reply as always, and no more than two of them — they can change anything afterwards, so stop asking and offer once you know enough to be useful.

Everything else is filled in only from what they have ALREADY said: never put down a grade, a subject, a length or a tone they haven't given you. Leave names out of all of it, the same as everywhere else.`

// Room for the tag so that adding one cannot cost the teacher a sentence.
export const BETTER_TOOL_TOKEN_BUFFER = 20

/// Splits a raw reply into what the teacher reads and which tool (if any)
/// Coach offered.
///
/// The tag is taken out whether or not it names a real tool: a hallucinated
/// key means no button, never markup in a teacher's chat.
export function readBetterTool(raw: string): { offer: ToolOffer | null; details: HandoffDetails | null; text: string } {
  const text = stripTag(stripTag(raw, TAG), DETAILS_TAG)

  // The details say which tool they belong to by their own shape, so a
  // reply that writes the block and forgets the tag — which happens, and
  // used to strip down to a blank message with no button — still lands
  // somewhere. When both are present and they disagree, the details win:
  // the button then matches the form the teacher is about to see.
  const fromDetails = readDetails(raw)
  const tagged = extractTag(raw, TAG)?.trim().toLowerCase()
  const key = fromDetails?.tool ?? (tagged && Object.hasOwn(TOOLS, tagged) ? (tagged as ToolKey) : null)
  if (!key) return { offer: null, details: null, text }

  const tool = TOOLS[key]
  return {
    offer: { key, label: tool.label, path: tool.path },
    details: fromDetails?.details ?? null,
    text,
  }
}

// Line-based "key: value", not JSON. A model mangles JSON far more often
// than it mangles lines, and a mangled line costs one field rather than the
// whole prefill. Unknown keys are ignored; a value that doesn't make sense
// is dropped, never passed through.
const MAX_SITUATION_CHARS = 1500
const MAX_TOPIC_CHARS = 300
const MAX_SHORT_CHARS = 60

function readLines(block: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const line of block.split('\n')) {
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i)
    if (match) found.set(match[1].toLowerCase(), match[2])
  }
  return found
}

function short(value: string | undefined): string | undefined {
  return value?.slice(0, MAX_SHORT_CHARS).trim() || undefined
}

function readDetails(raw: string): { tool: ToolKey; details: HandoffDetails } | null {
  const block = extractTag(raw, DETAILS_TAG)
  if (!block) return null
  const found = readLines(block)

  {
    // Without a topic there is nothing to prefill: the form's one required
    // field would still be empty, which is the problem this exists to fix.
    // A topic is the planning form's one required field, and nothing else
    // asks for one — so a block with a topic is a lesson.
    const topic = found.get('topic')?.slice(0, MAX_TOPIC_CHARS).trim()
    if (topic) {
      const minutes = Number.parseInt(found.get('minutes') ?? '', 10)
      const kind = found.get('kind')?.trim().toLowerCase()
      return {
        tool: 'planning_coach',
        details: {
          topic,
          subject: short(found.get('subject')),
          gradeLevel: short(found.get('grade')),
          // A lesson is not 4 minutes and not 9 hours; anything outside
          // that is a misread, and the form's default beats a wrong number.
          durationMinutes: Number.isInteger(minutes) && minutes >= 10 && minutes <= 180 ? minutes : undefined,
          kind: kind === 'ideas' || kind === 'full' ? kind : undefined,
        },
      }
    }
  }

  {
    const situation = found.get('situation')?.slice(0, MAX_SITUATION_CHARS).trim()
    if (!situation) return null
    const recipient = found.get('recipient')?.trim().toLowerCase()

    // Writing something and walking into a conversation are two different
    // forms behind one tool, and only the teacher's own situation says
    // which. A missing or unrecognised mode means the one that can't send
    // anything on their behalf.
    if (found.get('mode')?.trim().toLowerCase() === 'meeting') {
      const meetingType = found.get('meeting_type')?.trim().toLowerCase()
      const setting = found.get('setting')?.trim().toLowerCase()
      return {
        tool: 'communication_coach',
        details: {
          mode: 'meeting',
          situation,
          recipient: isValidRecipientType(recipient) ? recipient : undefined,
          meetingType: isValidMeetingType(meetingType) ? meetingType : undefined,
          meetingFormat: isValidMeetingFormat(setting) ? setting : undefined,
          desiredOutcome: found.get('outcome')?.slice(0, MAX_SITUATION_CHARS).trim() || undefined,
          concerns: found.get('worry')?.slice(0, MAX_SITUATION_CHARS).trim() || undefined,
        },
      }
    }

    const action = found.get('action')?.trim().toLowerCase()
    const purpose = found.get('purpose')?.trim().toLowerCase()
    const tone = found.get('tone')?.trim().toLowerCase()
    const format = found.get('format')?.trim().toLowerCase()
    return {
      tool: 'communication_coach',
      details: {
        mode: 'message',
        situation,
        // 'improve' needs a draft the teacher already wrote, which a chat
        // doesn't have — so a message from here is one of the other two.
        startingAction: action === 'respond' ? 'respond' : 'new',
        recipient: isValidRecipientType(recipient) ? recipient : undefined,
        purpose: isValidMessagePurpose(purpose) ? purpose : undefined,
        tone: isValidMessageTone(tone) ? tone : undefined,
        format: isValidMessageFormat(format) ? format : undefined,
      },
    }
  }
}
