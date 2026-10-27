// Runs after `vite build`: renders the public pages (src/prerender.tsx) to
// HTML and writes one file per route into dist/, so a crawler's first visit
// gets the page's text, title, description and canonical link instead of an
// empty <div id="root">.
//
// The browser still starts the app with createRoot, which replaces the
// prerendered markup on its first render; nothing is hydrated, so the page
// and the app can never disagree in a way React complains about.
//
// dist/index.html also answers every app route (/profile, /admin, …) through
// the host's rewrite. Its prerendered home page is hidden on any other path
// by a tiny script in <head>, so a signed-in teacher opening /profile never
// sees the marketing page flash before the app.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const ssrOut = join(root, 'dist-ssr')
const SITE = 'https://www.wivoza.com'

await build({
  root,
  logLevel: 'warn',
  build: { ssr: 'src/prerender.tsx', outDir: ssrOut, emptyOutDir: true },
})

const { render, ROUTES, PUBLIC_PAGE_META } = await import(pathToFileURL(join(ssrOut, 'prerender.js')).href)
const template = readFileSync(join(dist, 'index.html'), 'utf8')

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function swap(html, pattern, replacement, what) {
  const found = typeof pattern === 'string' ? html.includes(pattern) : pattern.test(html)
  if (!found) throw new Error(`prerender: ${what} not found in dist/index.html`)
  return html.replace(pattern, replacement)
}

for (const path of ROUTES) {
  const meta = PUBLIC_PAGE_META[path]
  if (!meta) throw new Error(`prerender: no PUBLIC_PAGE_META entry for ${path}`)
  // The trailing slash matches the address the host serves this file at.
  const url = `${SITE}${path === '/' ? '/' : `${path}/`}`
  const title = escape(meta.title)
  const description = escape(meta.description)

  let html = template
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, '<title>')
  html = swap(html, /(<meta\s+name="description"\s+content=")[^"]*(")/, (_, a, b) => `${a}${description}${b}`, 'meta description')
  html = swap(html, /(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => `${a}${url}${b}`, 'og:url')
  html = swap(html, /(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => `${a}${title}${b}`, 'og:title')
  html = swap(html, /(<meta\s+property="og:description"\s+content=")[^"]*(")/, (_, a, b) => `${a}${description}${b}`, 'og:description')
  html = swap(html, /(<meta name="twitter:title" content=")[^"]*(")/, (_, a, b) => `${a}${title}${b}`, 'twitter:title')
  html = swap(html, /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, (_, a, b) => `${a}${description}${b}`, 'twitter:description')
  // Not on the home page: dist/index.html is also what the host answers every
  // other unknown address with (a bare /faq included), and a canonical there
  // would claim all of them are the home page. The app sets it at runtime.
  if (path !== '/') html = swap(html, /<\/head>/, `    <link rel="canonical" href="${url}" />\n  </head>`, '</head>')
  if (path === '/') {
    html = swap(
      html,
      /<\/head>/,
      `    <style>[data-app-route] [data-prerendered]{display:none}</style>\n` +
        `    <script>if(location.pathname!=='/')document.documentElement.setAttribute('data-app-route','')</script>\n  </head>`,
      '</head>',
    )
  }
  html = swap(html, '<div id="root"></div>', () => `<div id="root"><div data-prerendered>${render(path)}</div></div>`, '#root')

  // Both /faq/index.html and /faq.html: static hosts differ on which one
  // they serve for /faq, and the one they skip costs nothing.
  const files = path === '/' ? [join(dist, 'index.html')] : [join(dist, path.slice(1), 'index.html'), join(dist, `${path.slice(1)}.html`)]
  for (const file of files) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, html)
  }
  console.log(`prerendered ${path}`)
}

rmSync(ssrOut, { recursive: true, force: true })
