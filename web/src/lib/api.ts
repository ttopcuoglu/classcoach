export type QAExchange = {
  id: string
  question: string
  answer: string
  starred: boolean
  createdAt: string
}

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
}

export type UserProfile = {
  id: string
  email: string
  name: string | null
  role: 'teacher' | 'admin'
  gradeLevels: string | null
  subjects: string | null
  onboardingProgress: string | null
  audioRetentionDays: number | null
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

export type Debrief = {
  id: string
  incidentText: string
  category: string | null
  feedback: string | null
  followUp: string | null
  rating: number | null
  saved: boolean
  shareToken: string | null
  createdAt: string
}

export type ParentMessageTone = 'warm' | 'firm' | 'informational' | 'requesting_meeting'

export type ParentMessage = {
  id: string
  incidentSummary: string
  tone: ParentMessageTone
  draftText: string
  saved: boolean
  createdAt: string
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

export type AudioHighlight = { label: string; timestampSec: number; excerpt: string }
export type AudioPhase = { label: string; startSec: number; endSec: number }
export type AudioQuote = { quote: string; timestampSec: number }
// Keyword/phrase-matched flags and quotes only — never scored.
export type AudioLessonContent = {
  topicTerms: string[]
  statedObjective: { found: boolean | null; quote: string | null; timestampSec: number | null }
  connections: AudioQuote[]
  vocabulary: AudioQuote[]
}

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
  lessonContent: AudioLessonContent | null
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

export function getQAHistory(): Promise<QAExchange[]> {
  return request('/api/qa')
}

export function askExpert(question: string): Promise<QAExchange> {
  return request('/api/qa/ask', { method: 'POST', body: JSON.stringify({ question }) })
}

export function setQAStarred(id: string, starred: boolean): Promise<QAExchange> {
  return request(`/api/qa/${id}`, { method: 'PATCH', body: JSON.stringify({ starred }) })
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
}): Promise<UserProfile> {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export function resetData(): Promise<{ status: string }> {
  return request('/api/profile/reset', { method: 'POST' })
}

export function getDebriefs(params?: { saved?: boolean }): Promise<Debrief[]> {
  const query = params?.saved ? '?saved=true' : ''
  return request(`/api/debriefs${query}`)
}

export function submitDebrief(incidentText: string, category?: string): Promise<Debrief> {
  return request('/api/debriefs', { method: 'POST', body: JSON.stringify({ incidentText, category }) })
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

export function draftParentMessage(
  incidentSummary: string,
  tone: ParentMessageTone,
): Promise<ParentMessage> {
  return request('/api/parent-messages', { method: 'POST', body: JSON.stringify({ incidentSummary, tone }) })
}

export function setParentMessageSaved(id: string, saved: boolean): Promise<ParentMessage> {
  return request(`/api/parent-messages/${id}`, { method: 'PATCH', body: JSON.stringify({ saved }) })
}

export function getSharedAttempt(token: string): Promise<SharedAttempt> {
  return request(`/api/share/attempt/${token}`)
}

export function getSharedDebrief(token: string): Promise<SharedDebrief> {
  return request(`/api/share/debrief/${token}`)
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
