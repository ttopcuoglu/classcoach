export type RecipientType = 'parent_caregiver' | 'student' | 'colleague' | 'administrator' | 'other'
export const RECIPIENT_TYPES: { label: string; value: RecipientType }[] = [
  { label: 'Parent or caregiver', value: 'parent_caregiver' },
  { label: 'Student', value: 'student' },
  { label: 'Colleague', value: 'colleague' },
  { label: 'Administrator', value: 'administrator' },
]

/// Preparing for a real conversation, where who it is may not fit four boxes and
/// recording that is better than forcing a wrong one. Deliberately not in
/// RECIPIENT_TYPES: Practice generates a person to argue with, and "someone
/// else" gives its generator nothing to write.
export const CONVERSATION_PERSON_TYPES: { label: string; value: RecipientType }[] = [
  ...RECIPIENT_TYPES,
  { label: 'Someone else', value: 'other' },
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

export function conversationDifficultyLabel(value: string | null) {
  if (!value) return null
  return CONVERSATION_DIFFICULTY_LEVELS.find((d) => d.value === value)?.label ?? value
}

export type MeetingFormat = 'in_person' | 'phone' | 'video' | 'formal_meeting'
export const MEETING_FORMATS: { label: string; value: MeetingFormat }[] = [
  { label: 'In person', value: 'in_person' },
  { label: 'Phone', value: 'phone' },
  { label: 'Video call', value: 'video' },
  { label: 'Formal meeting', value: 'formal_meeting' },
]

/// How a one-to-one happens. No "Formal meeting" — that is the other branch of
/// Prepare, and offering it to someone who said "a person" is offering them the
/// button they did not press.
export const PERSON_FORMATS = MEETING_FORMATS.filter((f) => f.value !== 'formal_meeting')

export function meetingFormatLabel(value: string | null) {
  if (!value) return null
  return MEETING_FORMATS.find((f) => f.value === value)?.label ?? value
}

export type MeetingType =
  | 'parent_family'
  | 'student'
  | 'iep_504'
  | 'team_department'
  | 'administrator'
  | 'post_observation'
  | 'difficult_colleague'
  | 'other'
export const MEETING_TYPES: { label: string; value: MeetingType }[] = [
  { label: 'Parent or family conference', value: 'parent_family' },
  { label: 'Student conference', value: 'student' },
  { label: 'IEP or 504 meeting', value: 'iep_504' },
  { label: 'Team or department meeting', value: 'team_department' },
  { label: 'Meeting with an administrator', value: 'administrator' },
  { label: 'Post-observation meeting', value: 'post_observation' },
  { label: 'Difficult colleague conversation', value: 'difficult_colleague' },
  { label: 'Other', value: 'other' },
]

/// What the meeting picker offers. "Difficult colleague conversation" is not a
/// meeting, it is a person — Prepare asks that on the other branch. It stays in
/// MEETING_TYPES above so plans already saved under it keep their label.
export const MEETING_TYPE_CHOICES = MEETING_TYPES.filter((m) => m.value !== 'difficult_colleague')

/// The example in "What is going on?" follows what the teacher just picked. A
/// co-teacher example under "Parent or family conference" is noise, and a blank
/// box is worse — the placeholder is the only thing on the screen showing how
/// much detail is worth giving.
const PERSON_EXAMPLES: Record<string, string> = {
  parent_caregiver:
    "A parent emailed saying I am picking on their son. I have to answer today and I do not want to make it worse...",
  student:
    "He has stopped handing anything in and shrugs when I ask why. I want to get somewhere without it becoming a lecture...",
  colleague:
    'My co-teacher keeps correcting me in front of the class, and it is getting worse...',
  administrator:
    'I need to tell my principal the new schedule is not working for my inclusion students, and I expect pushback...',
  other: 'Who it is with, what has been happening, and what makes it hard to say...',
}

const MEETING_EXAMPLES: Record<string, string> = {
  parent_family:
    'Conference is Thursday. Her grade has dropped since October and I do not think the family knows yet...',
  student:
    'I want to sit down with him about the missing work before it turns into a failing quarter...',
  iep_504:
    'His plan says extended time, he is still not finishing, and I think the accommodations need revisiting...',
  team_department:
    'I want to raise that our common assessment does not match what we are actually teaching, without it sounding like a complaint...',
  administrator:
    'I am asking for a different duty assignment, and I know the answer is probably no...',
  post_observation:
    'The group work stretch went badly while she was in the room, and I want to talk about what she saw...',
  other: 'What the meeting is about, and what makes it hard...',
}

export function situationPlaceholder(
  preparingFor: 'person' | 'meeting',
  recipientType: string | undefined,
  meetingType: string | undefined,
): string {
  const picked =
    preparingFor === 'person'
      ? recipientType && PERSON_EXAMPLES[recipientType]
      : meetingType && MEETING_EXAMPLES[meetingType]
  if (picked) return picked
  // Nothing chosen yet, so the example cannot name anyone without guessing.
  return preparingFor === 'person'
    ? 'Who it is with, what has been happening, and what makes it hard to say...'
    : 'What the meeting is about, and what makes it hard...'
}
export function meetingTypeLabel(value: string | null) {
  if (!value) return null
  return MEETING_TYPES.find((m) => m.value === value)?.label ?? value
}

// Best-effort mapping onto Practice's coarser RecipientType, for the
// "Practice This Meeting" handoff — several meeting types (IEP/504, team
// meeting, post-observation, other) don't map onto a specific person, so
// those are left undefined and Practice's own picker stays unset.
export function meetingTypeToRecipientType(value: MeetingType | undefined): RecipientType | undefined {
  switch (value) {
    case 'parent_family':
      return 'parent_caregiver'
    case 'student':
      return 'student'
    case 'administrator':
      return 'administrator'
    case 'difficult_colleague':
      return 'colleague'
    default:
      return undefined
  }
}

export type ReviewMode = 'feedback_only' | 'rewrite_only' | 'both'
export const REVIEW_MODES: { label: string; description: string; value: ReviewMode }[] = [
  { label: 'Give feedback only', description: 'Coaching notes, no rewrite.', value: 'feedback_only' },
  { label: 'Rewrite my response', description: 'A revised version, minimal commentary.', value: 'rewrite_only' },
  { label: 'Both', description: 'Feedback and a rewrite.', value: 'both' },
]
