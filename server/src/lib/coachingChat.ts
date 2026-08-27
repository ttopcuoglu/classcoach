// Reusable pieces for the follow-up chat threads appended to one-shot
// feedback results (Practice, Debrief, Conversation Prep, Parent Message).
// Deliberately kept as pure functions, no Prisma/Express here — each
// route keeps its own ownership checks, validation, and Claude call, since
// those genuinely differ per resource. Mirrors the shape already proven by
// AudioSession.reflectConversation, generalized for reuse.

export type ChatMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

export const CHAT_TURN_CAP = 8

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
