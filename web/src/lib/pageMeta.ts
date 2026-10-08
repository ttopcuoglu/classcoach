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
      'Every field, tab, and button in every Wivoza tool: Talk It Through, Lesson Debrief, Practice, Planning Coach, and Communication Coach.',
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
    description: 'How to use Talk It Through, Wivoza’s live voice coach, to think out loud about a classroom moment and leave with one next step.',
  },
  '/guide/lesson-debrief': {
    title: 'Lesson Debrief — a teacher’s guide | Wivoza',
    description: 'Record one class period and get a private report on talk time, questioning, wait time, and routines — then talk it through with your coach.',
  },
  // Route kept from when this surface was Ask & Practice; the page is Practice now.
  '/guide/ask-practice': {
    title: 'Practice — a teacher’s guide | Wivoza',
    description: 'Rehearse a classroom moment or a hard conversation before it happens, and get practical, judgment-free coaching on the words you used.',
  },
  // Route kept from when this surface was Lesson Planning; the page is
  // Planning Coach now.
  '/guide/lesson-planning': {
    title: 'Planning Coach — a teacher’s guide | Wivoza',
    description: 'Build a lesson from a topic or your own materials, strengthen a plan you already wrote, and adapt it before class.',
  },
  '/guide/assignment-coach': {
    title: 'Assignment Coach — a teacher’s guide | Wivoza',
    description: 'Review what an assignment really asks of students, or redesign it so students have to show their own thinking in the age of AI.',
  },
  '/guide/communication-coach': {
    title: 'Communication Coach — a teacher’s guide | Wivoza',
    description: 'Write a message, prepare for a meeting, or get a second read on a reply before you send it.',
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
