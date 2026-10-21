// Regenerates public/samples/lesson-debrief.pdf, the home page's sample
// Lesson Debrief, from the report's own "Save the full report as a PDF": the
// Summary and all four Insights sections, everything opened up.
//
// The report is the dev preview's (/audio-coaching?preview=1&home=debrief),
// but that fixture is built from a real lesson transcript, so before printing
// every line of the lesson's own text — the title, quotes, notes, Keep/Try
// lines, stage names, Content-type text — is swapped for the invented biology
// class the home page hero shows (scripts/capture-hero.mjs): "Cellular
// respiration: where a cell's energy comes from", Biology, 9th, period 3.
// The numbers stay the preview's, so the sample and the hero agree. The run
// fails if any of the real lesson's words survive anywhere on the printed page.
//
//   (web-preview dev server on :5180, see .claude/launch.json)
//   node scripts/capture-full-sample.mjs           writes public/samples/lesson-debrief.pdf
//   DUMP=1 node scripts/capture-full-sample.mjs    prints every text line on the page, unswapped
//
// The Plus card's thumbnail (lesson-debrief.png) is the PDF's first page:
//   python3 -c "import fitz; d=fitz.open('public/samples/lesson-debrief.pdf'); d[0].get_pixmap(matrix=fitz.Matrix(1600/612,1600/612)).save('public/samples/lesson-debrief.png')"

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SWAPS, LEAK } from './full-sample-swaps.mjs'

const APP = process.env.APP_URL ?? 'http://localhost:5180'
const OUT = new URL('../public/samples/lesson-debrief.pdf', import.meta.url).pathname
const PORT = 9338
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'full-sample-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let wsUrl
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
  } catch {}
}
const ws = new WebSocket(wsUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1800, deviceScaleFactor: 2, mobile: false })
  await send('Page.enable')
  await send('Page.navigate', { url: `${APP}/audio-coaching?preview=1&home=debrief` })
  await sleep(3500)

  await evaluate(`
    window.__nodes = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) if (n.textContent.trim()) a.push(n); return a };
    window.__norm = (t) => t.replace(/\\s+/g, ' ').trim();
    true
  `)

  // The same loudness track the hero has, so the talk bars come in all four
  // colours (see capture-hero.mjs). Wraps the preview's fake fetch, then
  // re-enters the page so the report is fetched through the wrapper.
  await evaluate(`(() => {
    const inner = window.fetch.bind(window);
    const fill = (s) => {
      if (!s || !Array.isArray(s.segments) || !s.durationSec) return s;
      const total = Math.ceil(s.durationSec);
      const speech = new Array(total).fill(false);
      for (const g of s.segments) if (g.text?.trim()) for (let t = Math.floor(g.startSec); t < Math.min(total, Math.ceil(g.endSec)); t++) speech[t] = true;
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const env = []; let kind = 's', left = 0;
      for (let t = 0; t < total; t++) {
        if (left <= 0) { kind = kind === 's' ? 'q' : 's'; left = kind === 's' ? 25 + rnd() * 50 : 6 + rnd() * 16; }
        env.push(speech[t] ? 's' : kind); left--;
      }
      const seconds = env.join('');
      let quietSec = 0, unresolvedSec = 0;
      for (let t = 0; t < total; t++) if (!speech[t]) (env[t] === 'q' ? quietSec++ : unresolvedSec++);
      return { ...s, soundTimeline: { ...(s.soundTimeline ?? {}), seconds }, metricsDetail: { ...(s.metricsDetail ?? {}), quietSec, unresolvedSec } };
    };
    window.fetch = async (input, init) => {
      const res = await inner(input, init);
      const url = String(input?.url ?? input);
      const path = new URL(url, location.href).pathname;
      if (!(path === '/api/audio-sessions' || path === '/api/audio-sessions/preview-report') || (init?.method && init.method !== 'GET')) return res;
      const body = await res.clone().json().catch(() => null);
      if (!body) return res;
      const out = Array.isArray(body) ? body.map((x) => (x.id === 'preview-report' ? fill(x) : x)) : fill(body);
      return new Response(JSON.stringify(out), { status: res.status, headers: { 'Content-Type': 'application/json' } });
    };
    history.pushState({}, '', '/?preview=1&home=debrief'); dispatchEvent(new PopStateEvent('popstate'));
    return true;
  })()`)
  await sleep(800)
  await evaluate(`history.pushState({}, '', '/audio-coaching?preview=1&home=debrief'); dispatchEvent(new PopStateEvent('popstate')); true`)
  await sleep(2000)

  // Open the report.
  for (let i = 0; i < 20; i++) {
    if (await evaluate(`!!__nodes().find((n) => n.textContent.startsWith('The decline and fall'))`)) break
    await sleep(500)
  }
  await evaluate(`__nodes().find((n) => n.textContent.startsWith('The decline and fall')).parentElement.click()`)
  await sleep(2000)

  // Press "Save the full report as a PDF" with the print dialog stubbed out,
  // so the page stays laid out for paper.
  await evaluate(`window.print = () => {}; [...document.querySelectorAll('button')].find((b) => b.innerText.includes('Save the full report as a PDF')).click(); true`)
  await sleep(2500)
  await send('Emulation.setEmulatedMedia', { media: 'print' })
  await sleep(500)

  if (process.env.DUMP) {
    const lines = await evaluate(`[...new Set(__nodes().filter((n) => n.parentElement.checkVisibility()).map((n) => __norm(n.textContent)))]`)
    console.log(JSON.stringify(lines, null, 1))
  } else {
    // Exact whole-node swaps first, then the date and the substring swaps
    // (names inside longer lines, the title wherever it's quoted).
    const misses = await evaluate(`(() => {
      const exact = ${JSON.stringify(SWAPS.exact)};
      const parts = ${JSON.stringify(SWAPS.parts)};
      const used = new Set();
      for (const n of __nodes()) {
        const t = __norm(n.textContent);
        if (exact[t] !== undefined) { n.textContent = n.textContent.replace(n.textContent.trim(), exact[t]); used.add(t) }
      }
      for (const n of __nodes()) {
        let s = n.textContent;
        for (const [from, to] of parts) if (s.includes(from)) { s = s.split(from).join(to); used.add(from) }
        if (/^[A-Z][a-z]{2} \\d{1,2}, \\d{4} at /.test(s.trim())) s = 'Oct 14, 2026 at 10:05 AM';
        if (s !== n.textContent) n.textContent = s;
      }
      // The help bubble and the phone tab bar are page chrome.
      for (const el of document.querySelectorAll('body *')) { const p = getComputedStyle(el).position; if (p === 'fixed') el.style.display = 'none' }
      return [...Object.keys(exact), ...parts.map((p) => p[0])].filter((k) => !used.has(k));
    })()`)
    if (misses.length) console.warn('swaps that matched nothing:', misses)
    await evaluate(`document.title = 'Cellular respiration — Lesson Debrief'; true`)
    await sleep(300)

    // Fail loudly if any of the real lesson's words survived anywhere.
    const leak = await evaluate(`document.body.innerText.match(new RegExp(${JSON.stringify(LEAK)}, 'gi'))`)
    if (leak) throw new Error('real-lesson words left on the page: ' + [...new Set(leak)].join(', '))

    const r = await send('Page.printToPDF', {
      printBackground: true, paperWidth: 8.5, paperHeight: 11,
      marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4,
    })
    if (!r.result?.data) throw new Error('printToPDF failed: ' + JSON.stringify(r.error))
    writeFileSync(OUT, Buffer.from(r.result.data, 'base64'))
    console.log('✓', OUT)
  }
} finally {
  ws.close()
  const exited = new Promise((resolve) => chrome.once('exit', resolve))
  chrome.kill()
  await exited
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
