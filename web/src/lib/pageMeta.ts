// Per-page title, description and canonical address for the public pages.
//
// Every route is served the same index.html, so without this each page
// carried the home page's canonical link — which tells Google that /guide,
// /faq and the rest are duplicates of the home page and not worth indexing.
// Keep this list and public/sitemap.xml in step.

const SITE = 'https://www.wivoza.com'
const DEFAULT_TITLE = 'Wivoza — AI coaching for K-12 teachers'
const DEFAULT_DESCRIPTION =
  'Wivoza is a private, judgment-free AI coaching app for K-12 teachers. Prepare for hard conversations, reflect on real lessons, and grow — one practical next step at a time.'

type Meta = { title: string; description: string }

export const PUBLIC_PAGE_META: Record<string, Meta> = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  '/guide': {
    title: 'The complete Wivoza guide — every feature, in full',
    description:
      'Every field, tab, and button in every Wivoza tool: Talk It Through, Lesson Debrief, Ask & Practice, Lesson Planning, Assignment Coach, and Communication Coach.',
  },
  '/faq': {
    title: 'Wivoza FAQ — privacy, evaluation, and how it works',
    description:
      'Answers to what teachers and school leaders ask before trying Wivoza: who sees your data, whether it is used to evaluate you, what it costs, and how to start.',
  },
  '/for-schools': {
    title: 'Wivoza for schools and districts',
    description:
      'Give every teacher private, Plus-level AI coaching. Leaders see aggregate trends — never an individual teacher’s work. Tell us about your school.',
  },
  '/terms': {
    title: 'Wivoza Terms of Use and Privacy Notice',
    description: 'The terms of use and privacy notice for Wivoza.',
  },
  '/guide/talk-it-through': {
    title: 'Talk It Through — a teacher’s guide | Wivoza',
    description: 'Think out loud about a classroom moment, or just ask — Wivoza’s voice coach listens, asks the right questions, and leaves you with one next step.',
  },
  '/guide/lesson-debrief': {
    title: 'Lesson Debrief — a teacher’s guide | Wivoza',
    description: 'Record one class period and get a private report on talk time, questioning, wait time and routines. Audio is never saved — only the text.',
  },
  '/guide/practice': {
    title: 'Practice — a teacher’s guide | Wivoza',
    description: 'Rehearse one realistic classroom moment at a time — a misconception, a parent email, a hard conversation — before it happens for real.',
  },
  '/guide/look-it-over': {
    title: 'Look It Over — a teacher’s guide | Wivoza',
    description: 'Drop in a quiz, lesson plan, slide deck, assignment or message and get a careful read before students or parents see it.',
  },
}

function setMeta(selector: string, attr: 'content' | 'href', value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

export function applyPageMeta(pathname: string) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const meta = PUBLIC_PAGE_META[path]
  const title = meta?.title ?? DEFAULT_TITLE
  const description = meta?.description ?? DEFAULT_DESCRIPTION
  const url = `${SITE}${path === '/' ? '/' : path}`

  document.title = title
  setMeta('meta[name="description"]', 'content', description, () => {
    const m = document.createElement('meta')
    m.setAttribute('name', 'description')
    return m
  })
  setMeta('meta[property="og:title"]', 'content', title, () => {
    const m = document.createElement('meta')
    m.setAttribute('property', 'og:title')
    return m
  })
  setMeta('meta[property="og:description"]', 'content', description, () => {
    const m = document.createElement('meta')
    m.setAttribute('property', 'og:description')
    return m
  })
  setMeta('meta[property="og:url"]', 'content', url, () => {
    const m = document.createElement('meta')
    m.setAttribute('property', 'og:url')
    return m
  })

  // Only public pages get a canonical link. Signed-in pages are blocked in
  // robots.txt and have no business claiming an address in search.
  const existing = document.head.querySelector('link[rel="canonical"]')
  if (meta) {
    setMeta('link[rel="canonical"]', 'href', url, () => {
      const l = document.createElement('link')
      l.setAttribute('rel', 'canonical')
      return l
    })
  } else if (existing) {
    existing.remove()
  }
}
