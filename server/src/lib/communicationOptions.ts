export const RECIPIENT_TYPES = ['parent_caregiver', 'student', 'colleague', 'administrator'] as const
export type RecipientType = (typeof RECIPIENT_TYPES)[number]

export const MESSAGE_PURPOSES = [
  'academic_concern',
  'behavior_concern',
  'attendance_concern',
  'positive_update',
  'meeting_request',
  'follow_up',
  'general_information',
  'other',
] as const
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number]

export const MESSAGE_TONES = ['warm', 'professional', 'firm', 'urgent'] as const
export type MessageTone = (typeof MESSAGE_TONES)[number]

export const MESSAGE_FORMATS = ['email', 'text', 'announcement', 'phone_call_followup'] as const
export type MessageFormat = (typeof MESSAGE_FORMATS)[number]

export const STARTING_ACTIONS = ['new', 'respond', 'improve'] as const
export type StartingAction = (typeof STARTING_ACTIONS)[number]

export const CHALLENGE_TYPES = [
  'angry_accusatory',
  'grade_dispute',
  'behavior_concern',
  'attendance_concern',
  'unmotivated_student',
  'boundary_setting',
  'disagreement_colleague',
  'formal_meeting',
  'other_custom',
] as const
export type ChallengeType = (typeof CHALLENGE_TYPES)[number]

export const CONVERSATION_DIFFICULTY_LEVELS = ['supportive', 'concerned', 'resistant', 'highly_escalated'] as const
export type ConversationDifficulty = (typeof CONVERSATION_DIFFICULTY_LEVELS)[number]

export const MEETING_FORMATS = ['in_person', 'phone', 'video', 'formal_meeting'] as const
export type MeetingFormat = (typeof MEETING_FORMATS)[number]

export const REVIEW_MODES = ['feedback_only', 'rewrite_only', 'both'] as const
export type ReviewMode = (typeof REVIEW_MODES)[number]

function makeValidator<T extends readonly string[]>(values: T) {
  return (value: unknown): value is T[number] => typeof value === 'string' && (values as readonly string[]).includes(value)
}

export const isValidRecipientType = makeValidator(RECIPIENT_TYPES)
export const isValidMessagePurpose = makeValidator(MESSAGE_PURPOSES)
export const isValidMessageTone = makeValidator(MESSAGE_TONES)
export const isValidMessageFormat = makeValidator(MESSAGE_FORMATS)
export const isValidStartingAction = makeValidator(STARTING_ACTIONS)
export const isValidChallengeType = makeValidator(CHALLENGE_TYPES)
export const isValidConversationDifficulty = makeValidator(CONVERSATION_DIFFICULTY_LEVELS)
export const isValidMeetingFormat = makeValidator(MEETING_FORMATS)
export const isValidReviewMode = makeValidator(REVIEW_MODES)
