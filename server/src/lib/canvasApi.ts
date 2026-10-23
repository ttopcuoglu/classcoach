// The handful of Canvas REST calls Send to Canvas makes, and the OAuth that
// gets a teacher's permission for them. Kept apart from routes/canvas.ts so
// it can be exercised against a stand-in for Canvas.

export class CanvasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/// Exactly what Wivoza asks Canvas for. A school whose API key enforces
/// scopes must tick these four; one that does not gets a token limited to
/// them anyway.
export const CANVAS_SCOPES = [
  'url:GET|/api/v1/courses',
  'url:GET|/api/v1/courses/:course_id/modules',
  'url:POST|/api/v1/courses/:course_id/pages',
  'url:POST|/api/v1/courses/:course_id/modules/:module_id/items',
]

/// A school's Canvas address, as an origin: "hampden.instructure.com",
/// "https://canvas.school.org/" and the like all become
/// "https://<host>". Null for anything that is not a plain https host.
export function normalizeCanvasUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) return null
    return `https://${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`
  } catch {
    return null
  }
}

export type CanvasApp = { canvasUrl: string; clientId: string; clientSecret: string; redirectUri: string }
type Fetch = typeof fetch

export function authorizeUrl(app: CanvasApp, state: string): string {
  const url = new URL('/login/oauth2/auth', app.canvasUrl)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', app.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', CANVAS_SCOPES.join(' '))
  return url.toString()
}

/// Tells Canvas to forget a token, so a disconnect is not only Wivoza
/// forgetting it. Best effort: a token Canvas already dropped is fine.
export async function revokeToken(canvasUrl: string, accessToken: string, doFetch: Fetch = fetch): Promise<void> {
  await doFetch(new URL('/login/oauth2/token', canvasUrl), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => undefined)
}

export type TokenGrant = { accessToken: string; refreshToken: string | null; expiresAt: Date; canvasUserId: string | null }

async function tokenRequest(app: CanvasApp, params: Record<string, string>, doFetch: Fetch): Promise<TokenGrant> {
  const res = await doFetch(new URL('/login/oauth2/token', app.canvasUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri, ...params }),
    signal: AbortSignal.timeout(15000),
  })
  const body = (await res.json().catch(() => null)) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    user?: { id?: number | string }
    error?: string
    error_description?: string
  } | null
  if (!res.ok || !body?.access_token) {
    throw new CanvasApiError(body?.error_description || body?.error || `Canvas refused the sign-in (${res.status}).`, res.status)
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (body.expires_in ?? 3600) * 1000),
    canvasUserId: body.user?.id != null ? String(body.user.id) : null,
  }
}

export function exchangeCode(app: CanvasApp, code: string, doFetch: Fetch = fetch): Promise<TokenGrant> {
  return tokenRequest(app, { grant_type: 'authorization_code', code }, doFetch)
}

/// Canvas keeps the same refresh token, so a refresh returns none of its own.
export async function refreshAccess(app: CanvasApp, refreshToken: string, doFetch: Fetch = fetch): Promise<TokenGrant> {
  const grant = await tokenRequest(app, { grant_type: 'refresh_token', refresh_token: refreshToken }, doFetch)
  return { ...grant, refreshToken: grant.refreshToken ?? refreshToken }
}

async function call<T>(canvasUrl: string, token: string, path: string, init: RequestInit = {}, doFetch: Fetch = fetch): Promise<T> {
  const res = await doFetch(new URL(path, canvasUrl), {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[]; message?: string } | null
    const message = body?.errors?.[0]?.message ?? body?.message ?? `Canvas answered ${res.status}.`
    throw new CanvasApiError(message, res.status)
  }
  return (await res.json()) as T
}

export type CanvasCourse = { id: string; name: string; courseCode: string | null }

/// The courses this person teaches, current ones first.
export async function listTeachingCourses(canvasUrl: string, token: string, doFetch: Fetch = fetch): Promise<CanvasCourse[]> {
  const courses = await call<{ id: number; name?: string; course_code?: string; access_restricted_by_date?: boolean }[]>(
    canvasUrl,
    token,
    '/api/v1/courses?enrollment_type=teacher&state[]=available&state[]=unpublished&per_page=100',
    {},
    doFetch,
  )
  return courses
    .filter((c) => !c.access_restricted_by_date && c.name)
    .map((c) => ({ id: String(c.id), name: c.name!, courseCode: c.course_code ?? null }))
}

export async function listModules(canvasUrl: string, token: string, courseId: string, doFetch: Fetch = fetch): Promise<{ id: string; name: string }[]> {
  const modules = await call<{ id: number; name: string }[]>(canvasUrl, token, `/api/v1/courses/${encodeURIComponent(courseId)}/modules?per_page=100`, {}, doFetch)
  return modules.map((m) => ({ id: String(m.id), name: m.name }))
}

/// An unpublished page unless asked otherwise: a lesson plan carries
/// teacher-only material, and students cannot see an unpublished page.
export async function createPage(
  canvasUrl: string,
  token: string,
  courseId: string,
  page: { title: string; html: string; published: boolean },
  doFetch: Fetch = fetch,
): Promise<{ url: string; htmlUrl: string }> {
  const created = await call<{ url: string; html_url: string }>(
    canvasUrl,
    token,
    `/api/v1/courses/${encodeURIComponent(courseId)}/pages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wiki_page: { title: page.title, body: page.html, published: page.published, editing_roles: 'teachers' } }),
    },
    doFetch,
  )
  return { url: created.url, htmlUrl: created.html_url }
}

export async function addPageToModule(
  canvasUrl: string,
  token: string,
  courseId: string,
  moduleId: string,
  page: { title: string; url: string },
  doFetch: Fetch = fetch,
): Promise<void> {
  await call(
    canvasUrl,
    token,
    `/api/v1/courses/${encodeURIComponent(courseId)}/modules/${encodeURIComponent(moduleId)}/items`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ module_item: { type: 'Page', page_url: page.url, title: page.title } }),
    },
    doFetch,
  )
}
