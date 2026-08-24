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
  source: string
  createdAt: string
}

export type ScenarioAttempt = {
  id: string
  scenarioId: string
  responseText: string
  feedback: string | null
  modelResponse: string | null
  saved: boolean
  createdAt: string
  scenario: Scenario
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

export function generateScenario(category?: string, gradeBand?: string): Promise<Scenario> {
  return request('/api/scenarios/generate', { method: 'POST', body: JSON.stringify({ category, gradeBand }) })
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
