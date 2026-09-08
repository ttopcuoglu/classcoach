// Cross-tool prefill handoff (Prepare → Write's "Convert to a message", and
// Recent Work's "Duplicate") — same sessionStorage-handoff pattern already
// used by onboarding's `classcoach.suggestedCategory`. Each tool reads and
// clears its own key on mount.
export type WritePrefill = {
  startingAction?: 'new' | 'respond' | 'improve'
  incidentSummary?: string
  receivedMessage?: string
  existingDraft?: string
  recipientType?: string
  purpose?: string
  tone?: string
  format?: string
}

export type PreparePrefill = {
  situationText?: string
  recipientType?: string
  meetingType?: string
  desiredOutcome?: string
  concerns?: string
  background?: string
  meetingFormat?: string
}

export type PracticePrefill = {
  personType?: string
  challenge?: string
  gradeBand?: string
  difficulty?: string
  // A custom scenario description — used by "Practice This Meeting" to
  // hand off a real meeting's situation text directly, bypassing the
  // generated-scenario path entirely (no challenge/difficulty needed).
  situationText?: string
}

export type ReviewPrefill = {
  situationText?: string
  responseText?: string
}

export type AskPrefill = {
  incidentText?: string
}

// Carries an already-reviewed assignment's text (plus a short note on why
// it was flagged) straight into the Redesign intake screen, so a teacher
// acting on a Review session's AI-completion-risk finding never has to
// re-upload or re-paste what's already on file.
export type AssignmentRedesignPrefill = {
  originalText: string
  extraNote?: string
}

const KEYS = {
  write: 'wivoza.prefill.write',
  prepare: 'wivoza.prefill.prepare',
  practice: 'wivoza.prefill.practice',
  review: 'wivoza.prefill.review',
  ask: 'wivoza.prefill.ask',
  assignmentRedesign: 'wivoza.prefill.assignmentRedesign',
} as const

function setPrefill<T>(key: string, value: T) {
  sessionStorage.setItem(key, JSON.stringify(value))
}

function takePrefill<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key)
  if (!raw) return null
  sessionStorage.removeItem(key)
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const setWritePrefill = (value: WritePrefill) => setPrefill(KEYS.write, value)
export const takeWritePrefill = () => takePrefill<WritePrefill>(KEYS.write)

export const setPreparePrefill = (value: PreparePrefill) => setPrefill(KEYS.prepare, value)
export const takePreparePrefill = () => takePrefill<PreparePrefill>(KEYS.prepare)

export const setPracticePrefill = (value: PracticePrefill) => setPrefill(KEYS.practice, value)
export const takePracticePrefill = () => takePrefill<PracticePrefill>(KEYS.practice)

export const setReviewPrefill = (value: ReviewPrefill) => setPrefill(KEYS.review, value)
export const takeReviewPrefill = () => takePrefill<ReviewPrefill>(KEYS.review)

export const setAskPrefill = (value: AskPrefill) => setPrefill(KEYS.ask, value)
export const takeAskPrefill = () => takePrefill<AskPrefill>(KEYS.ask)

export const setAssignmentRedesignPrefill = (value: AssignmentRedesignPrefill) => setPrefill(KEYS.assignmentRedesign, value)
export const takeAssignmentRedesignPrefill = () => takePrefill<AssignmentRedesignPrefill>(KEYS.assignmentRedesign)
