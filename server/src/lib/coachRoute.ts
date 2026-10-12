// The box on Home: one sentence in, one answer and one door out.
//
// A teacher typing prose into Home has not chosen a tool — the same
// situation Telegram is in, which betterTool.ts already answers with a tag
// riding along on a reply Coach is generating anyway. Home has no reply to
// ride on, so this is the one place that does pay for a call of its own.
// That is the whole reason it is ONE turn and the reply is two sentences:
// what the teacher is buying is the door, not the conversation. A chat here
// would charge every teacher a model call to reach a page they could have
// clicked in the sidebar.
//
// Two differences from the Telegram roster, both because there is no chat
// around this one:
//
//  1. talk_it_through is a sixth key. In Telegram it is not a key at all,
//     because there the chat IS Talk It Through. Here it is a door like any
//     other, and the honest answer more often than the other five.
//  2. Every reply carries a tag. In a chat most replies should have none —
//     the answer is the answer. Here the box exists to send them somewhere,
//     so "no tool fits" is talk_it_through, not a missing tag.

import {
  FILL_ONLY_FROM_SAID,
  readBetterTool,
  TOOL_DETAILS_INSTRUCTION,
  TOOL_LINES,
  TOOLS,
  type HandoffDetails,
  type ToolKey,
} from './betterTool.ts'
import { extractTag } from './extractTag.ts'

export type HomeToolKey = ToolKey | 'talk_it_through'

// Only planning_coach and communication_coach have a form a details block
// can fill. readDetails reads a block's SHAPE to decide where it belongs,
// which is right in a chat but wrong here: asked whether an assignment is
// chatbot-proof, Claude tagged assignment_coach and then wrote `topic:`
// out of habit, and a topic line means "lesson" — so the teacher was sent
// to build a lesson about their own worksheet. For a tool with nothing to
// prefill, the tag it wrote is the better evidence than the block it
// should not have written.
const TOOLS_WITHOUT_PREFILL: readonly string[] = ['lesson_debrief', 'practice', 'assignment_coach']

export type HomeOffer = { key: HomeToolKey; label: string; path: string }

const TALK_IT_THROUGH: HomeOffer = { key: 'talk_it_through', label: 'Talk it through', path: '/talk-to-me' }

// One turn means Coach cannot ask for the length and offer on the next
// reply, which is what CHAT_DURATION_RULE does. The form still must not
// build on a guessed period — see 0a91aef — so the door opens filled in and
// stops there, and the reply does the asking.
const HOME_DURATION_RULE = `For planning_coach you get no second turn, so you cannot ask how long the lesson is and offer afterwards. When they have not said a length, offer anyway and leave the minutes line out — the form opens filled in and they add it themselves — and use one of your two sentences to ask how long the period is. Never guess a length: a lesson built to the wrong one is worse than a form they finish. When they HAVE said it, fill it in and say nothing about it.`

export const HOME_ROUTER_PROMPT = `You are Wivoza's coach, answering a teacher who has typed one line into the box on their home page. They have not picked a tool. This box is where a teacher goes precisely when they do not know which one they need.

You get ONE turn. There is no conversation here — they read what you say and either take the door you offer or they don't.

- Two sentences at most, and often one is better — but never zero. A tag with no words above it reaches the teacher as a button under a blank space. Even when the door says everything, say the one line that makes it theirs.
- Answer like someone who has read what they wrote. Never open by restating it back to them, and never congratulate them on asking.
- Say nothing you cannot stand behind from their one line alone. You do not know their room, their students or what happened today.
- Never name the tool in your words. The tag below becomes a button that names itself, and naming it in the sentence hands them off twice.

End every reply with exactly one tag, after your last sentence:

<better_tool>key</better_tool>

The keys, and when each one fits:
${TOOL_LINES}
- talk_it_through: everything else, and that is most of it. A hard day, a class that is slipping, a feeling with no artefact at the end of it, a question that wants a person rather than a form. This is Coach in conversation, spoken or typed. Reach for it rather than forcing one of the five above to fit — a teacher sent to the wrong form has to come back and start again, and most of them will not.

Practice is for a moment that has NOT happened yet — something they are dreading, or a kind of moment that keeps recurring. Something that already happened today, and how it left them, is talk_it_through, even when they wish they had said something different. Rehearsing is for next time; the thing that just happened needs a conversation first.

There is no untagged reply here. When nothing is being made, the tag is talk_it_through.

${TOOL_DETAILS_INSTRUCTION}

${HOME_DURATION_RULE}

${FILL_ONLY_FROM_SAID}`

/// What the model wrote, split into the sentence a teacher reads and the
/// door underneath it.
///
/// talk_it_through is read before anything else: it is the "no tool fits"
/// answer, so a details block written beside it is a contradiction, and the
/// safe reading of a contradiction is the door that cannot get anything
/// wrong.
export function readHomeRoute(raw: string): { text: string; offer: HomeOffer | null; details: HandoffDetails | null } {
  const read = readBetterTool(raw)
  const tagged = extractTag(raw, 'better_tool')?.trim().toLowerCase()

  if (tagged === 'talk_it_through') return { text: read.text, offer: TALK_IT_THROUGH, details: null }

  if (tagged && TOOLS_WITHOUT_PREFILL.includes(tagged)) {
    const tool = TOOLS[tagged as ToolKey]
    return { text: read.text, offer: { key: tagged as ToolKey, label: tool.label, path: tool.path }, details: null }
  }

  if (read.offer) return { text: read.text, offer: read.offer, details: read.details }

  // A key Claude invented, or no tag at all. Both mean the same thing here:
  // nothing was chosen, and the conversation is the door that always works.
  return { text: read.text, offer: TALK_IT_THROUGH, details: null }
}

export function homeToolLabel(key: HomeToolKey): string {
  return key === 'talk_it_through' ? TALK_IT_THROUGH.label : TOOLS[key].label
}
