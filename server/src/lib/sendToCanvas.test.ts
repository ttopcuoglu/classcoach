import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addPageToModule,
  authorizeUrl,
  CANVAS_SCOPES,
  CanvasApiError,
  createPage,
  exchangeCode,
  listTeachingCourses,
  normalizeCanvasUrl,
  refreshAccess,
  type CanvasApp,
} from './canvasApi.ts'
import { lessonHtml, textToHtml } from './lessonHtml.ts'
import { open, seal } from './secretBox.ts'

test('sealed secrets open again, and nothing else does', () => {
  const sealed = seal('canvas-secret-123')
  assert.notEqual(sealed, 'canvas-secret-123')
  assert.equal(open(sealed), 'canvas-secret-123')
  assert.notEqual(seal('same'), seal('same'), 'each seal uses a fresh IV')
  const [v, iv, tag, body] = sealed.split('.')
  assert.equal(open([v, iv, tag, body.slice(0, -2) + (body.endsWith('AA') ? 'BB' : 'AA')].join('.')), null, 'tampered')
  assert.equal(open('not sealed'), null)
})

test('Canvas addresses become a plain https origin', () => {
  assert.equal(normalizeCanvasUrl('hampden.instructure.com'), 'https://hampden.instructure.com')
  assert.equal(normalizeCanvasUrl(' https://Canvas.School.org/courses/12 '), 'https://canvas.school.org')
  assert.equal(normalizeCanvasUrl('http://hampden.instructure.com'), null, 'not https')
  assert.equal(normalizeCanvasUrl('https://user:pw@hampden.instructure.com'), null)
  assert.equal(normalizeCanvasUrl('localhost'), null)
  assert.equal(normalizeCanvasUrl(''), null)
})

test('plain text becomes paragraphs and lists, escaped', () => {
  assert.equal(textToHtml('Teacher:\nDate:'), '<p>Teacher:<br>Date:</p>')
  assert.equal(textToHtml('- one\n- two <b>'), '<ul><li>one</li><li>two &lt;b&gt;</li></ul>')
  assert.equal(textToHtml('1. a\n2. b\n\nAfter'), '<ol><li>a</li><li>b</li></ol>\n<p>After</p>')
})

test('a lesson goes out in the format the teacher is looking at', () => {
  const plan = {
    objective: 'Explain why a cell needs a membrane',
    sequence: [{ minutes: 10, title: 'Launch', teacher: 'Hold up the bag.', students: 'Predict.' }],
    templateContent: {
      templateId: 't',
      templateName: 'School',
      sourceKey: 'k',
      sections: [
        { id: 's1', title: 'Learning Target', kind: 'objective', text: 'I can explain it.' },
        { id: 's2', title: 'Accommodations', kind: 'teacher_fills', text: '' },
      ],
    },
  }
  const school = lessonHtml(plan, true)
  assert.ok(school.includes('<h2>Learning Target</h2>\n<p>I can explain it.</p>'))
  assert.ok(school.includes('<h2>Accommodations</h2>\n<p>&nbsp;</p>'), 'an empty teacher box stays in the page')
  const wivoza = lessonHtml(plan, false)
  assert.ok(wivoza.includes('<h2>1. Launch — 10 min</h2>'))
  assert.ok(!wivoza.includes('Learning Target'))
  assert.ok(!/wivoza/i.test(school + wivoza), 'no branding on the page')
})

test('a week goes out day by day', () => {
  const html = lessonHtml(
    {
      planKind: 'week',
      week: {
        days: [],
        content: {
          templateId: null,
          templateName: 'x',
          shared: [{ id: 'w1', title: 'Unit', kind: 'details', text: 'Polynomials' }],
          days: [{ label: 'Monday', sections: [{ id: 'd1', title: 'Objective', kind: 'objective', text: 'SWBAT read end behavior.' }] }],
        },
      },
    },
    true,
  )
  assert.equal(html, '<h2>This week</h2>\n<h3>Unit</h3>\n<p>Polynomials</p>\n<h2>Monday</h2>\n<h3>Objective</h3>\n<p>SWBAT read end behavior.</p>')
})

// A stand-in Canvas: records every request and answers like the real one.
function fakeCanvas(routes: Record<string, (init: RequestInit) => [number, unknown]>) {
  const seen: { method: string; path: string; auth: string | null; body: string | null }[] = []
  const doFetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const headers = (init.headers ?? {}) as Record<string, string>
    seen.push({ method, path: url.pathname + url.search, auth: headers.authorization ?? null, body: init.body ? String(init.body) : null })
    const handler = routes[`${method} ${url.pathname}`]
    const [status, body] = handler ? handler(init) : [404, { errors: [{ message: 'not found' }] }]
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { seen, doFetch }
}

const APP: CanvasApp = { canvasUrl: 'https://hampden.instructure.com', clientId: '170000000000042', clientSecret: 's3cret', redirectUri: 'https://www.wivoza.com/api/canvas/oauth/callback' }

test('the consent link asks for exactly the four scopes Wivoza uses', () => {
  const url = new URL(authorizeUrl(APP, 'st'))
  assert.equal(url.origin + url.pathname, 'https://hampden.instructure.com/login/oauth2/auth')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('state'), 'st')
  assert.deepEqual(url.searchParams.get('scope')!.split(' '), CANVAS_SCOPES)
})

test('tokens are exchanged and refreshed, keeping the refresh token', async () => {
  const { seen, doFetch } = fakeCanvas({
    'POST /login/oauth2/token': (init) => {
      const p = new URLSearchParams(String(init.body))
      return p.get('grant_type') === 'authorization_code'
        ? [200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: { id: 77 } }]
        : [200, { access_token: 'a2', expires_in: 3600 }]
    },
  })
  const grant = await exchangeCode(APP, 'code-1', doFetch)
  assert.equal(grant.accessToken, 'a1')
  assert.equal(grant.canvasUserId, '77')
  const body = new URLSearchParams(seen[0].body!)
  assert.equal(body.get('client_secret'), 's3cret')
  assert.equal(body.get('redirect_uri'), APP.redirectUri)
  const refreshed = await refreshAccess(APP, 'r1', doFetch)
  assert.equal(refreshed.accessToken, 'a2')
  assert.equal(refreshed.refreshToken, 'r1', 'Canvas reuses the refresh token')
})

test('a refused exchange says so', async () => {
  const { doFetch } = fakeCanvas({ 'POST /login/oauth2/token': () => [400, { error: 'invalid_client', error_description: 'unknown client' }] })
  await assert.rejects(exchangeCode(APP, 'x', doFetch), (e: unknown) => e instanceof CanvasApiError && e.status === 400 && e.message === 'unknown client')
})

test('sending creates an unpublished page and adds it to the module', async () => {
  const { seen, doFetch } = fakeCanvas({
    'GET /api/v1/courses': () => [200, [{ id: 12, name: 'Algebra 2', course_code: 'ALG2' }, { id: 13, name: 'Old', access_restricted_by_date: true }]],
    'POST /api/v1/courses/12/pages': () => [200, { url: 'cells-lesson', html_url: 'https://hampden.instructure.com/courses/12/pages/cells-lesson' }],
    'POST /api/v1/courses/12/modules/5/items': () => [200, { id: 1 }],
  })
  assert.deepEqual(await listTeachingCourses(APP.canvasUrl, 'tok', doFetch), [{ id: '12', name: 'Algebra 2', courseCode: 'ALG2' }])
  const page = await createPage(APP.canvasUrl, 'tok', '12', { title: 'Cells', html: '<p>x</p>', published: false }, doFetch)
  assert.equal(page.url, 'cells-lesson')
  await addPageToModule(APP.canvasUrl, 'tok', '12', '5', { title: 'Cells', url: page.url }, doFetch)

  const create = seen.find((r) => r.method === 'POST' && r.path.endsWith('/pages'))!
  assert.equal(create.auth, 'Bearer tok')
  assert.deepEqual(JSON.parse(create.body!).wiki_page, { title: 'Cells', body: '<p>x</p>', published: false, editing_roles: 'teachers' })
  const item = seen.find((r) => r.path.endsWith('/items'))!
  assert.deepEqual(JSON.parse(item.body!).module_item, { type: 'Page', page_url: 'cells-lesson', title: 'Cells' })
})

test('a revoked token comes back as a 401 the route can act on', async () => {
  const { doFetch } = fakeCanvas({ 'GET /api/v1/courses': () => [401, { errors: [{ message: 'Invalid access token.' }] }] })
  await assert.rejects(listTeachingCourses(APP.canvasUrl, 'old', doFetch), (e: unknown) => e instanceof CanvasApiError && e.status === 401)
})
