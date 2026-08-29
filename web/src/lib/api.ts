// A follow-up coaching chat thread, appended below a one-shot result.
// Seeded with the original submission + first reply, grown by follow-up
// turns. Same shape as Audio Coaching's AudioReflectMessage.
export type ChatMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

export type Scenario = {
  id: string
  text: string
  category: string
  gradeBand: string
  difficulty: string
  source: string
  createdAt: string
  // Only present on a generate response — true when Claude generation
  // failed and a curated scenario was served instead.
  fallback?: boolean
}

export type ScenarioAttempt = {
  id: string
  scenarioId: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  // Claude's private 1-5 self-assessment, for growth trends only — never
  // shown to the user as a literal score.
  rating: number | null
  saved: boolean
  createdAt: string
  scenario: Scenario
  conversation: ChatMessage[]
}

export type FocusMetric =
  | 'talkRatio'
  | 'higherOrderPct'
  | 'avgWaitTime'
  | 'cfuCount'
  | 'followUpQuestionCount'
  | 'redirectionCount'
  | 'toneRatio'
  | 'directiveCount'
  | 'nameMentionCount'
  | 'feedbackSpecificity'

export type UserProfile = {
  id: string
  email: string
  name: string | null
  role: 'teacher' | 'admin'
  gradeLevels: string | null
  subjects: string | null
  onboardingProgress: string | null
  audioRetentionDays: number | null
  focusMetric: FocusMetric | null
  createdAt: string
  updatedAt: string
}

export type AdminOverview = {
  totalTeachers: number
  activeThisWeek: number
  categoryTally: Record<string, number>
  growth: {
    recentStrongShare: number | null
    priorStrongShare: number | null
  }
}

export type DebriefSource = 'ask_tab' | 'talk_to_me'

export type Debrief = {
  id: string
  incidentText: string
  category: string | null
  feedback: string | null
  followUp: string | null
  rating: number | null
  source: DebriefSource | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
}

// tone values changed with the Communications redesign — old rows may have
// "informational"/"requesting_meeting" (requesting a meeting is now a
// `purpose`, not a tone); toneLabel() in communicationOptions.ts falls back
// to the raw value so old saved messages still render correctly.
export type ParentMessageTone = 'warm' | 'professional' | 'firm' | 'urgent'
export type StartingAction = 'new' | 'respond' | 'improve'

export type ParentMessage = {
  id: string
  startingAction: StartingAction | null
  incidentSummary: string | null
  receivedMessage: string | null
  existingDraft: string | null
  recipientType: string | null
  purpose: string | null
  format: string | null
  tone: ParentMessageTone
  draftText: string
  title: string | null
  saved: boolean
  createdAt: string
  conversation: ChatMessage[]
}

export type SharedAttempt = {
  type: 'attempt'
  scenario: Scenario
  responseText: string
  feedback: string | null
  modelResponse: string | null
  createdAt: string
}

export type SharedDebrief = {
  type: 'debrief'
  incidentText: string
  category: string | null
  feedback: string | null
  followUp: string | null
  createdAt: string
}

// mode is "feedback" (teacher's own plan + coaching) or "generated" (a
// sample plan from just an objective) — see server/prisma/schema.prisma.
export type LessonPlanMode = 'feedback' | 'generated'

export type LessonPlan = {
  id: string
  mode: LessonPlanMode
  objective: string | null
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  subject: string | null
  gradeLevel: string | null
  planText: string | null
  feedback: string | null
  rating: number | null
  doNow: string | null
  agenda: string | null
  closure: string | null
  hots: string | null
  homework: string | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
  suggestedRevision: string | null
}

export type SharedLessonPlan = {
  type: 'lesson-plan'
  mode: LessonPlanMode
  objective: string
  unitName: string | null
  essentialQuestion: string | null
  standard: string | null
  subject: string | null
  gradeLevel: string | null
  planText: string | null
  feedback: string | null
  doNow: string | null
  agenda: string | null
  closure: string | null
  hots: string | null
  homework: string | null
  createdAt: string
}

// category holds the practice challenge type (see communicationOptions.ts
// CHALLENGE_TYPES); null for review rows, which have no category picker.
// Old rows may still have a legacy value (hostile_response/phone_call) —
// challengeLabel() falls back to the raw value.
export type ConversationPrepCategory = string

// "practice" = a generated hypothetical scenario; "review" = an actual
// received message + planned response (renamed from "real").
export type ConversationPrepSource = 'practice' | 'review'

export type CoachingReportDimension = { rating: string; feedback: string }
export type CoachingReport = {
  clarity: CoachingReportDimension
  empathy: CoachingReportDimension
  evidence: CoachingReportDimension
  boundaries: CoachingReportDimension
  collaboration: CoachingReportDimension
  resolution: CoachingReportDimension
  didWell: string
  priority: string
  strongerPhrase: string
  modelResponse: string
  nextStep: string
}

export type ConversationPrep = {
  id: string
  category: ConversationPrepCategory | null
  personType: string | null
  difficulty: string | null
  reviewMode: string | null
  source: ConversationPrepSource
  gradeBand: string | null
  situationText: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  rating: number | null
  coachingReport: CoachingReport | null
  title: string | null
  saved: boolean
  shareToken: string | null
  createdAt: string
  conversation: ChatMessage[]
}

export type SharedConversationPrep = {
  type: 'conversation-prep'
  category: ConversationPrepCategory | null
  gradeBand: string | null
  situationText: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  createdAt: string
}

export type ConversationPlanContent = {
  opening: string
  mainConcern: string
  facts: string
  questions: string
  reactions: string
  recommendedResponses: string
  phrasesToAvoid: string
  boundaries: string
  closing: string
  modelResponse: string
  nextSteps: string
  adminInvolvement: string
}

export type ConversationPlan = {
  id: string
  recipientType: string | null
  situationText: string
  desiredOutcome: string | null
  concerns: string | null
  background: string | null
  meetingFormat: string | null
  planContent: ConversationPlanContent | null
  title: string | null
  saved: boolean
  createdAt: string
  conversation: ChatMessage[]
}

// status is one of: setup, recording, paused, transcribing, tagging,
// analyzed, locked
export type AudioSessionStatus =
  | 'setup'
  | 'recording'
  | 'paused'
  | 'transcribing'
  | 'tagging'
  | 'analyzed'
  | 'locked'

export type AudioHighlight = { label: string; timestampSec: number; excerpt: string; durationSec?: number }
export type AudioPhase = { label: string; startSec: number; endSec: number }
export type AudioQuote = { quote: string; timestampSec: number }
export type AudioQuestionLogEntry = {
  timestampSec: number
  type: 'recall' | 'higher_order'
  waitTimeSec: number | null
  text: string
  followUps: { timestampSec: number; text: string }[]
}
export type AudioReflectMessage = { role: 'user' | 'assistant'; text: string; createdAt: string }

// Keyword/phrase-matched flags and quotes only — never scored.
export type AudioTopicTerm = { term: string; count: number }
export type AudioLessonContent = {
  // string[] is the shape stored by sessions analyzed before speaker-split
  // word clouds shipped — rendered as the old flat chip list, never crashes.
  topicTerms: string[] | { teacher: AudioTopicTerm[]; student: AudioTopicTerm[] }
  statedObjective: { found: boolean | null; quote: string | null; timestampSec: number | null }
  connections: AudioQuote[]
  vocabulary: AudioQuote[]
  subject: string | null
}

export type AudioContentNote = {
  id: string
  label: 'Clarity' | 'Vocabulary' | 'Engagement with content' | 'Worth double-checking'
  text: string
  timestampSec: number
  excerpt: string
}
export type AudioContentNotes = { subject: string; notes: AudioContentNote[] }

export type AudioSession = {
  id: string
  teacherName: string | null
  classSubject: string | null
  period: string | null
  gradeLevel: string | null
  sessionDate: string
  consentConfirmed: boolean
  status: AudioSessionStatus
  durationSec: number | null
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number | null
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  metricsDetail: Record<string, number | null> | null
  highlights: AudioHighlight[] | null
  phases: AudioPhase[] | null
  questionLog: AudioQuestionLogEntry[] | null
  reflectConversation: AudioReflectMessage[] | null
  lessonContent: AudioLessonContent | null
  contentNotes: AudioContentNotes | null
  strengths: string | null
  growthAreas: string | null
  nextStep: string | null
  followUpDate: string | null
  createdAt: string
  updatedAt: string
}

export type TranscriptSegment = {
  id: string
  speakerLabel: string
  rawSpeakerTag: string
  startSec: number
  endSec: number
  text: string
}

export type AudioSessionWithSegments = AudioSession & { segments: TranscriptSegment[] }

export type SpeakerSample = { rawSpeakerTag: string; sample: string }

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export function signInWithGoogle(credential: string): Promise<UserProfile> {
  return request('/api/auth/google', { method: 'POST', body: JSON.stringify({ credential }) })
}

export function getMe(): Promise<UserProfile> {
  return request('/api/auth/me')
}

export function logout(): Promise<{ status: string }> {
  return request('/api/auth/logout', { method: 'POST' })
}

export function getAdminOverview(): Promise<AdminOverview> {
  return request('/api/admin/overview')
}

export function generateScenario(
  category?: string,
  gradeBand?: string,
  difficulty?: string,
  subject?: string,
): Promise<Scenario> {
  return request('/api/scenarios/generate', {
    method: 'POST',
    body: JSON.stringify({ category, gradeBand, difficulty, subject }),
  })
}

export function getAttempts(params?: { saved?: boolean }): Promise<ScenarioAttempt[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/attempts${query}`)
}

export function submitAttempt(scenarioId: string, responseText: string): Promise<ScenarioAttempt> {
  return request('/api/attempts', { method: 'POST', body: JSON.stringify({ scenarioId, responseText }) })
}

export function sendAttemptChat(id: string, message: string): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setAttemptSaved(id: string, saved: boolean): Promise<ScenarioAttempt> {
  return request(`/api/attempts/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function shareAttempt(id: string): Promise<{ shareToken: string }> {
  return request(`/api/attempts/${id}/share`, { method: 'POST' })
}

export function getProfile(): Promise<UserProfile> {
  return request('/api/profile')
}

export function updateProfile(data: {
  name?: string
  gradeLevels?: string
  subjects?: string
  onboardingProgress?: string
  audioRetentionDays?: number | null
  focusMetric?: FocusMetric | null
}): Promise<UserProfile> {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export function resetData(): Promise<{ status: string }> {
  return request('/api/profile/reset', { method: 'POST' })
}

export function getDebriefs(params?: { saved?: boolean; source?: DebriefSource }): Promise<Debrief[]> {
  const query = new URLSearchParams()
  if (params?.saved) query.set('saved', 'true')
  if (params?.source) query.set('source', params.source)
  const queryString = query.toString()
  return request(`/api/debriefs${queryString ? `?${queryString}` : ''}`)
}

export function submitDebrief(incidentText: string): Promise<Debrief> {
  return request('/api/debriefs', { method: 'POST', body: JSON.stringify({ incidentText }) })
}

export function sendDebriefChat(id: string, message: string): Promise<Debrief> {
  return request(`/api/debriefs/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function startTalkToMe(message: string): Promise<Debrief> {
  return request('/api/debriefs/talk', { method: 'POST', body: JSON.stringify({ message }) })
}

// Returns raw audio, not JSON — uses fetch directly rather than the
// JSON-only request() helper, same pattern as other binary/non-JSON calls
// in this file.
export async function synthesizeSpeech(text: string): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/api/tts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.blob()
}

export function setDebriefSaved(id: string, saved: boolean): Promise<Debrief> {
  return request(`/api/debriefs/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function shareDebrief(id: string): Promise<{ shareToken: string }> {
  return request(`/api/debriefs/${id}/share`, { method: 'POST' })
}

export function getParentMessages(params?: { saved?: boolean }): Promise<ParentMessage[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/parent-messages${query}`)
}

export type DraftMessageInput = {
  startingAction: StartingAction
  incidentSummary?: string
  receivedMessage?: string
  contextNotes?: string
  existingDraft?: string
  recipientType?: string
  purpose?: string
  format?: string
  tone: ParentMessageTone
}

export function draftParentMessage(input: DraftMessageInput): Promise<ParentMessage> {
  return request('/api/parent-messages', { method: 'POST', body: JSON.stringify(input) })
}

export function sendParentMessageChat(id: string, message: string): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setParentMessageSaved(id: string, saved: boolean): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameParentMessage(id: string, title: string): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteParentMessage(id: string): Promise<void> {
  return request(`/api/parent-messages/${id}`, { method: 'DELETE' })
}

export function getSharedAttempt(token: string): Promise<SharedAttempt> {
  return request(`/api/share/attempt/${token}`)
}

export function getSharedDebrief(token: string): Promise<SharedDebrief> {
  return request(`/api/share/debrief/${token}`)
}

export function getSharedLessonPlan(token: string): Promise<SharedLessonPlan> {
  return request(`/api/share/lesson-plan/${token}`)
}

export function getSharedConversationPrep(token: string): Promise<SharedConversationPrep> {
  return request(`/api/share/conversation-prep/${token}`)
}

export function getConversationPreps(params?: { saved?: boolean }): Promise<ConversationPrep[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/conversation-prep${query}`)
}

export type SubmitConversationPrepInput = {
  situationText: string
  responseText: string
  source: ConversationPrepSource
  category?: string
  gradeBand?: string
  personType?: string
  difficulty?: string
  reviewMode?: string
}

export function submitConversationPrep(input: SubmitConversationPrepInput): Promise<ConversationPrep> {
  return request('/api/conversation-prep', { method: 'POST', body: JSON.stringify(input) })
}

export function sendConversationPrepChat(id: string, message: string): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function generateConversationScenario(input: {
  category: string
  gradeBand?: string
  personType?: string
  difficulty?: string
}): Promise<{ situationText: string; gradeBand: string }> {
  return request('/api/conversation-prep/generate-scenario', { method: 'POST', body: JSON.stringify(input) })
}

export function setConversationPrepSaved(id: string, saved: boolean): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameConversationPrep(id: string, title: string): Promise<ConversationPrep> {
  return request(`/api/conversation-prep/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteConversationPrep(id: string): Promise<void> {
  return request(`/api/conversation-prep/${id}`, { method: 'DELETE' })
}

export function shareConversationPrep(id: string): Promise<{ shareToken: string }> {
  return request(`/api/conversation-prep/${id}/share`, { method: 'POST' })
}

export type SubmitConversationPlanInput = {
  situationText: string
  recipientType?: string
  desiredOutcome?: string
  concerns?: string
  background?: string
  meetingFormat?: string
}

export function getConversationPlans(params?: { saved?: boolean }): Promise<ConversationPlan[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/conversation-plans${query}`)
}

export function submitConversationPlan(input: SubmitConversationPlanInput): Promise<ConversationPlan> {
  return request('/api/conversation-plans', { method: 'POST', body: JSON.stringify(input) })
}

export function sendConversationPlanChat(id: string, message: string): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function setConversationPlanSaved(id: string, saved: boolean): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function renameConversationPlan(id: string, title: string): Promise<ConversationPlan> {
  return request(`/api/conversation-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) })
}

export function deleteConversationPlan(id: string): Promise<void> {
  return request(`/api/conversation-plans/${id}`, { method: 'DELETE' })
}

export type LessonPlanContext = {
  objective: string
  unitName?: string
  essentialQuestion?: string
  standard?: string
  subject?: string
  gradeLevel?: string
}

export function getLessonPlans(params?: { saved?: boolean; mode?: LessonPlanMode }): Promise<LessonPlan[]> {
  const query = new URLSearchParams()
  if (params?.saved) query.set('saved', 'true')
  if (params?.mode) query.set('mode', params.mode)
  const qs = query.toString()
  return request(`/api/lesson-plans${qs ? `?${qs}` : ''}`)
}

export function getLessonPlan(id: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}`)
}

export function submitLessonPlanFeedback(context: LessonPlanContext, planText: string): Promise<LessonPlan> {
  return request('/api/lesson-plans/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...context, planText }),
  })
}

export function sendLessonPlanChat(id: string, message: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })
}

export function applyLessonPlanRevision(id: string): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}/apply-revision`, { method: 'POST' })
}

export function generateLessonPlan(context: LessonPlanContext): Promise<LessonPlan> {
  return request('/api/lesson-plans/generate', { method: 'POST', body: JSON.stringify(context) })
}

export function setLessonPlanSaved(id: string, saved: boolean): Promise<LessonPlan> {
  return request(`/api/lesson-plans/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function shareLessonPlan(id: string): Promise<{ shareToken: string }> {
  return request(`/api/lesson-plans/${id}/share`, { method: 'POST' })
}

export function getAudioSessions(): Promise<AudioSession[]> {
  return request('/api/audio-sessions')
}

export function getAudioSession(id: string): Promise<AudioSessionWithSegments> {
  return request(`/api/audio-sessions/${id}`)
}

export function createAudioSession(data: {
  teacherName?: string
  classSubject?: string
  period?: string
  gradeLevel?: string
  sessionDate?: string
  consentConfirmed: boolean
}): Promise<AudioSession> {
  return request('/api/audio-sessions', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAudioSession(
  id: string,
  data: Partial<{
    teacherName: string
    classSubject: string
    period: string
    gradeLevel: string
    sessionDate: string
    status: AudioSessionStatus
    strengths: string
    growthAreas: string
    nextStep: string
    followUpDate: string | null
    phases: AudioPhase[]
    durationSec: number
  }>,
): Promise<AudioSession> {
  return request(`/api/audio-sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

// Uses fetch directly rather than the JSON-only request() helper, since it
// needs to send FormData (the recorded audio blob), not a JSON body.
export async function transcribeAudioSession(
  id: string,
  audioBlob: Blob,
): Promise<{ speakers: SpeakerSample[] }> {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'session-audio')
  const res = await fetch(`${API_BASE_URL}/api/audio-sessions/${id}/transcribe`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
}

export function tagSpeaker(id: string, rawSpeakerTag: string): Promise<AudioSessionWithSegments> {
  return request(`/api/audio-sessions/${id}/tag-speaker`, {
    method: 'POST',
    body: JSON.stringify({ rawSpeakerTag }),
  })
}

export function deleteAudioSession(id: string): Promise<{ status: string }> {
  return request(`/api/audio-sessions/${id}`, { method: 'DELETE' })
}

export type ReflectChatErrorKind = 'locked' | 'turn_cap' | 'daily_limit' | 'other'

export async function sendReflectMessage(
  id: string,
  data: { message?: string; context: string[] },
): Promise<AudioSession> {
  const res = await fetch(`${API_BASE_URL}/api/audio-sessions/${id}/reflect-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const kind: ReflectChatErrorKind =
      res.status === 403 ? 'locked' : res.status === 409 ? 'turn_cap' : res.status === 429 ? 'daily_limit' : 'other'
    throw Object.assign(new Error(body?.error ?? `Request failed with status ${res.status}`), { kind })
  }
  return res.json()
}

export function summarizeReflectConversation(
  id: string,
): Promise<{ strengths: string | null; growthAreas: string | null; nextStep: string | null }> {
  return request(`/api/audio-sessions/${id}/reflect-summary`, { method: 'POST' })
}

export function generateContentNotes(id: string): Promise<AudioSession> {
  return request(`/api/audio-sessions/${id}/content-notes`, { method: 'POST' })
}
