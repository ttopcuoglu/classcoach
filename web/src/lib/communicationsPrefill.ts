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
}

export type ReviewPrefill = {
  situationText?: string
  responseText?: string
}

const KEYS = {
  write: 'wivoza.prefill.write',
  prepare: 'wivoza.prefill.prepare',
  practice: 'wivoza.prefill.practice',
  review: 'wivoza.prefill.review',
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
