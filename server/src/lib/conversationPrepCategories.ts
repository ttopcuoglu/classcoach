export const CONVERSATION_PREP_CATEGORIES = [
  'hostile_response',
  'phone_call',
  'boundary_setting',
  'formal_meeting',
] as const

export function isValidConversationPrepCategory(
  value: unknown,
): value is (typeof CONVERSATION_PREP_CATEGORIES)[number] {
  return typeof value === 'string' && (CONVERSATION_PREP_CATEGORIES as readonly string[]).includes(value)
}
