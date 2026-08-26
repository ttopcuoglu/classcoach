import type { ConversationPrepCategory } from './api'

export const CONVERSATION_PREP_CATEGORIES: { label: string; value: ConversationPrepCategory }[] = [
  { label: 'Hostile Message', value: 'hostile_response' },
  { label: 'Phone Call', value: 'phone_call' },
  { label: 'Boundary-Setting', value: 'boundary_setting' },
  { label: 'Formal Meeting', value: 'formal_meeting' },
]

export function conversationPrepCategoryLabel(value: string): string {
  return CONVERSATION_PREP_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export const CONVERSATION_PREP_COPY: Record<
  ConversationPrepCategory,
  { situationLabel: string; situationPlaceholder: string; responseLabel: string; responsePlaceholder: string }
> = {
  hostile_response: {
    situationLabel: 'The message you received',
    situationPlaceholder: "Paste the parent or colleague's message here...",
    responseLabel: 'Your planned reply',
    responsePlaceholder: 'Draft how you plan to respond...',
  },
  phone_call: {
    situationLabel: "What's the situation?",
    situationPlaceholder: 'Describe why you need to make this call and any context the parent may not know yet...',
    responseLabel: 'What you plan to say',
    responsePlaceholder: 'Draft what you’d say, including roughly how you’d open and close the call...',
  },
  boundary_setting: {
    situationLabel: "What's being asked of you?",
    situationPlaceholder: "Describe what the parent or colleague is asking for, and why you need to say no or set a limit...",
    responseLabel: 'How you plan to respond',
    responsePlaceholder: 'Draft how you’d hold the boundary...',
  },
  formal_meeting: {
    situationLabel: "What's the meeting?",
    situationPlaceholder: "Describe the meeting, who's attending, and what needs to be decided or communicated...",
    responseLabel: 'Your talking points',
    responsePlaceholder: 'Draft your opening, key points, and how you plan to close...',
  },
}
