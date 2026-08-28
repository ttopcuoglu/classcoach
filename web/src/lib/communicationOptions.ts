export type RecipientType = 'parent_caregiver' | 'student' | 'colleague' | 'administrator'
export const RECIPIENT_TYPES: { label: string; value: RecipientType }[] = [
  { label: 'Parent or caregiver', value: 'parent_caregiver' },
  { label: 'Student', value: 'student' },
  { label: 'Colleague', value: 'colleague' },
  { label: 'Administrator', value: 'administrator' },
]
export function recipientLabel(value: string | null) {
  if (!value) return null
  return RECIPIENT_TYPES.find((r) => r.value === value)?.label ?? value
}

export type MessagePurpose =
  | 'academic_concern'
  | 'behavior_concern'
  | 'attendance_concern'
  | 'positive_update'
  | 'meeting_request'
  | 'follow_up'
  | 'general_information'
  | 'other'
export const MESSAGE_PURPOSES: { label: string; value: MessagePurpose }[] = [
  { label: 'Academic concern', value: 'academic_concern' },
  { label: 'Behavior concern', value: 'behavior_concern' },
  { label: 'Attendance concern', value: 'attendance_concern' },
  { label: 'Positive update', value: 'positive_update' },
  { label: 'Meeting request', value: 'meeting_request' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'General information', value: 'general_information' },
  { label: 'Other', value: 'other' },
]
export function purposeLabel(value: string | null) {
  if (!value) return null
  return MESSAGE_PURPOSES.find((p) => p.value === value)?.label ?? value
}

export type MessageTone = 'warm' | 'professional' | 'firm' | 'urgent'
export const MESSAGE_TONES: { label: string; value: MessageTone }[] = [
  { label: 'Warm and supportive', value: 'warm' },
  { label: 'Professional and neutral', value: 'professional' },
  { label: 'Firm and direct', value: 'firm' },
  { label: 'Urgent', value: 'urgent' },
]
export function toneLabel(value: string) {
  return MESSAGE_TONES.find((t) => t.value === value)?.label ?? value
}

export type MessageFormat = 'email' | 'text' | 'announcement' | 'phone_call_followup'
export const MESSAGE_FORMATS: { label: string; value: MessageFormat }[] = [
  { label: 'Email', value: 'email' },
  { label: 'Text message', value: 'text' },
  { label: 'Announcement', value: 'announcement' },
  { label: 'Phone-call follow-up', value: 'phone_call_followup' },
]
export function formatLabel(value: string | null) {
  if (!value) return null
  return MESSAGE_FORMATS.find((f) => f.value === value)?.label ?? value
}

export type StartingAction = 'new' | 'respond' | 'improve'
export const STARTING_ACTIONS: { label: string; description: string; value: StartingAction }[] = [
  { label: 'Start a new message', description: 'Draft something from scratch.', value: 'new' },
  { label: 'Respond to a message', description: 'Reply to something you received.', value: 'respond' },
  { label: 'Improve my draft', description: 'Polish something you already wrote.', value: 'improve' },
]

export type ChallengeType =
  | 'angry_accusatory'
  | 'grade_dispute'
  | 'behavior_concern'
  | 'attendance_concern'
  | 'unmotivated_student'
  | 'boundary_setting'
  | 'disagreement_colleague'
  | 'formal_meeting'
  | 'other_custom'
export const CHALLENGE_TYPES: { label: string; value: ChallengeType }[] = [
  { label: 'Angry or accusatory person', value: 'angry_accusatory' },
  { label: 'Grade dispute', value: 'grade_dispute' },
  { label: 'Behavior concern', value: 'behavior_concern' },
  { label: 'Attendance concern', value: 'attendance_concern' },
  { label: 'Unmotivated student', value: 'unmotivated_student' },
  { label: 'Boundary-setting', value: 'boundary_setting' },
  { label: 'Disagreement with a colleague', value: 'disagreement_colleague' },
  { label: 'Formal meeting', value: 'formal_meeting' },
  { label: 'Other / custom scenario', value: 'other_custom' },
]
export function challengeLabel(value: string | null) {
  if (!value) return null
  return CHALLENGE_TYPES.find((c) => c.value === value)?.label ?? value
}

export type ConversationDifficulty = 'supportive' | 'concerned' | 'resistant' | 'highly_escalated'
export const CONVERSATION_DIFFICULTY_LEVELS: { label: string; value: ConversationDifficulty }[] = [
  { label: 'Supportive', value: 'supportive' },
  { label: 'Concerned', value: 'concerned' },
  { label: 'Resistant', value: 'resistant' },
  { label: 'Highly escalated', value: 'highly_escalated' },
]

export type MeetingFormat = 'in_person' | 'phone' | 'video' | 'formal_meeting'
export const MEETING_FORMATS: { label: string; value: MeetingFormat }[] = [
  { label: 'In person', value: 'in_person' },
  { label: 'Phone', value: 'phone' },
  { label: 'Video', value: 'video' },
  { label: 'Formal meeting', value: 'formal_meeting' },
]

export type ReviewMode = 'feedback_only' | 'rewrite_only' | 'both'
export const REVIEW_MODES: { label: string; description: string; value: ReviewMode }[] = [
  { label: 'Give feedback only', description: 'Coaching notes, no rewrite.', value: 'feedback_only' },
  { label: 'Rewrite my response', description: 'A revised version, minimal commentary.', value: 'rewrite_only' },
  { label: 'Both', description: 'Feedback and a rewrite.', value: 'both' },
]
