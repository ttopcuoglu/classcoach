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
  name: string | null
  gradeLevels: string | null
  subjects: string | null
  createdAt: string
  updatedAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `Request failed with status ${res.status}`)
  }
  return res.json()
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

export function getProfile(): Promise<UserProfile> {
  return request('/api/profile')
}

export function updateProfile(data: {
  name?: string
  gradeLevels?: string
  subjects?: string
}): Promise<UserProfile> {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(data) })
}

export function resetData(): Promise<{ status: string }> {
  return request('/api/profile/reset', { method: 'POST' })
}
