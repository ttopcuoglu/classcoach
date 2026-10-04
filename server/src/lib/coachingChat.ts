// Reusable pieces for the follow-up chat threads appended to one-shot
// feedback results (Practice, Debrief, Conversation Prep, Parent Message).
// Deliberately kept as pure functions, no Prisma/Express here — each
// route keeps its own ownership checks, validation, and Claude call, since
// those genuinely differ per resource. Mirrors the shape already proven by
// AudioSession.reflectConversation, generalized for reuse.

export type ChatMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

export const CHAT_TURN_CAP = 8

// What every thread says when it hits its cap. It used to read "You've
// reached today's practice limit for this conversation", which was wrong
// twice over: the limit is per conversation, not per day, and it sent a
// teacher off to wait until tomorrow for something a new conversation fixes
// right away. One shared string so the features cannot drift apart again.
export const CONVERSATION_FULL_MESSAGE = 'This conversation has reached its length limit. Start a new one to keep going.'

// Talk It Through gets its own, much higher ceiling. The 8 above suits the
// typed follow-up threads it was made for, where each turn is a considered
// paragraph. A spoken conversation is a different shape: Coach answers in
// about a sentence, so eight turns is a couple of minutes, and the teacher
// hits the wall mid-thought — which got more likely, not less, once replies
// started arriving fast enough to feel like a real conversation.
//
// This is still a real cap, not a formality. Every turn re-sends the whole
// conversation, so cost per turn grows as a conversation gets longer, and
// the daily conversational budget in usageLimit.ts is the backstop across
// conversations rather than within one.
export const TALK_TURN_CAP = 30

export function countUserTurns(conversation: ChatMessage[]): number {
  return conversation.filter((m) => m.role === 'user').length
}

export function toClaudeMessages(
  conversation: ChatMessage[],
  newMessage: string,
): { role: 'user' | 'assistant'; content: string }[] {
  return [
    ...conversation.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user' as const, content: newMessage },
  ]
}

export function appendTurn(conversation: ChatMessage[], userText: string, assistantText: string): ChatMessage[] {
  const now = new Date().toISOString()
  return [
    ...conversation,
    { role: 'user' as const, text: userText, createdAt: now },
    { role: 'assistant' as const, text: assistantText, createdAt: now },
  ]
}
