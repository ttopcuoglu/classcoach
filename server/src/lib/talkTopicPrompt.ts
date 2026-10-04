// How a chosen topic reaches Talk It Through's prompt.
//
// Kept out of TALK_SYSTEM_PROMPT, and out of the route, for two different
// reasons. Out of the prompt because that string is byte-identical for every
// teacher so it caches once, and anything varying per conversation has to
// follow it. Out of the route because these are pure string builders and the
// wording is the feature — they are worth testing without standing up
// express, prisma and an Anthropic client to do it.

import { SOMETHING_ELSE, TOPIC_FOLLOWS_THE_WORDS, findTopic, type Topic } from './topics.ts'

/// A kind of moment within a topic, as the chip row offers them.
export type TopicKind = Topic['kinds'][number]

/// Talk It Through used to open with the teacher talking into silence: the
/// endpoint required a message, so Coach could not say anything until it had
/// been spoken to. This is the synthetic first turn that lets Coach greet
/// them instead, the same shape Reflect already used.
export const TALK_START_MESSAGE = 'Start our conversation.'

/// The greeting instruction when no topic was chosen.
export function buildGreetingBlock(firstName: string | null | undefined): string {
  const named = firstName ? ` Greet them by name — they are called ${firstName}.` : ''
  return `\n\nThis is the first thing you say, before the teacher has said anything at all. Open the conversation yourself: a warm, short hello and one genuine, open question inviting them to say what is on their mind.${named} Two sentences at most, no advice yet, nothing about a lesson or a problem you have not been told about.\n`
}

/// Where the coach OPENS when the teacher tapped a topic chip first.
///
/// Kept out of TALK_SYSTEM_PROMPT for the same reason the greeting is: that
/// prompt is byte-identical for every teacher so it caches once, and anything
/// that varies per conversation has to follow it.
///
/// The hard part of this feature is not the opener, it is the restraint. A
/// teacher who taps "Classroom Management" and then talks about a parent
/// email must be answered about the parent email. So the stance is stated,
/// and then TOPIC_FOLLOWS_THE_WORDS immediately takes the chip's authority
/// away again — it decides sentence one and nothing after it.
///
/// "Something else" deliberately produces no block at all. It is the chip a
/// teacher taps to say "do not assume anything", so adding a paragraph of
/// assumptions would invert its meaning.
export function buildTopicBlock(topic: Topic | null, kind?: TopicKind | null): string {
  if (!topic || topic.value === SOMETHING_ELSE) return ''
  // The narrower choice is stated as a narrowing of the same chip, not as a
  // second subject. TOPIC_FOLLOWS_THE_WORDS still follows it and still takes
  // the authority back: a teacher who taps "Phones and devices" and then
  // talks about a parent email is answered about the parent email.
  const narrowed = kind ? ` Within it they narrowed to "${kind.label}".` : ''
  return `\n\nThe teacher chose a topic before saying anything: "${topic.label}".${narrowed} For this conversation you are a ${topic.coachRole}.\n\n${topic.safety}\n\n${TOPIC_FOLLOWS_THE_WORDS}\n`
}

/// The opening line for a chosen topic — the teacher has said nothing yet, so
/// the question has to come from the chip.
export function buildTopicGreetingBlock(
  topic: Topic | null,
  firstName: string | null | undefined,
  kind?: TopicKind | null,
): string {
  if (!topic || topic.value === SOMETHING_ELSE) return buildGreetingBlock(firstName)
  const named = firstName ? ` Greet them by name — they are called ${firstName}.` : ''
  // The opener stays the topic's. The kind only says which corner of it to
  // ask about: an opener written per kind would be thirty more strings to
  // keep true, and the topic's own question already fits all of them.
  const about = kind ? ` Ask it about ${kind.label.toLowerCase()} specifically.` : ''
  return `\n\nThis is the first thing you say, before the teacher has said anything at all. Open with a warm, short hello and then ask this, or a close paraphrase of it: "${topic.opener}"${about}${named} Two sentences at most, no advice yet, and nothing about a situation you have not been told about — you know the subject they picked, not what happened.\n`
}

/// The chosen topic off a request body, or null. Null covers both "the
/// teacher skipped the chips" and "a client sent junk", which are the same
/// thing as far as coaching goes: open with no assumption.
export function topicFromRequest(value: unknown): Topic | null {
  return findTopic(value)
}

/// The chosen kind off a request body, validated against the topic it claims
/// to belong to. A kind from another topic is dropped rather than honoured:
/// the pair is what the teacher saw on screen, and the two disagreeing means
/// one of them is stale.
export function kindFromRequest(topic: Topic | null, value: unknown): TopicKind | null {
  if (!topic || typeof value !== 'string') return null
  return topic.kinds.find((k) => k.value === value) ?? null
}

/// Facts a teacher arrives with from another surface — a lesson report, a
/// document review — handed to the coach as context rather than as something
/// the teacher said.
///
/// Framed as "what the teacher is bringing" and explicitly fenced: the coach
/// may use it, must not recite it back, and must not treat it as a verdict.
/// A report measured what it could hear; it did not decide what the lesson
/// was worth, and a coach that opens by reading numbers aloud has turned a
/// conversation into a results readout.
export function buildHandoffContextBlock(context: string | null | undefined): string {
  const trimmed = typeof context === 'string' ? context.trim().slice(0, 2000) : ''
  if (!trimmed) return ''
  return `\n\nThe teacher has just come here from somewhere else in the app, and this is what came with them:\n${trimmed}\n\nUse it so they do not have to explain what you could already know. Do not read it back to them, do not quote numbers at them unless they ask, and do not treat it as a judgment about their teaching — it is what one recording could measure, nothing more. Their first message tells you what they actually want to talk about; this is only background.\n`
}
