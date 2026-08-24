export type QAExchange = {
  id: string
  question: string
  answer: string
  starred: boolean
  createdAt: string
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
