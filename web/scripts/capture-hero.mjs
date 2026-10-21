// Captures the real Lesson Debrief UI from the local dev preview, with the
// lesson's topic, date and every quoted line swapped for an invented class,
// at 2x for the landing page hero. Needs the web-preview dev server on :5180.
// Usage: node scripts/capture-hero.mjs <outDir> <width> — the Summary was taken
// at 720, and so was the Talk & Participation chart.
// (writes debrief-*.png; rename to hero-debrief-*.png)
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = process.argv[2]
const PORT = 9337
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const profile = mkdtempSync(join(tmpdir(), 'shoot-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
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

const W = Number(process.argv[3] ?? 720)
await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: 2, mobile: W < 640 })
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:5180/audio-coaching?preview=1&home=debrief' })
await sleep(3500)

// Helpers that run in the page.
await evaluate(`
  window.__nodes = () => { const w = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) if (n.textContent.trim()) a.push(n); return a };
  window.__swap = (pairs) => { for (const n of __nodes()) { const t = n.textContent.trim(); if (pairs[t] !== undefined) n.textContent = n.textContent.replace(t, pairs[t]) } };
  window.__after = (anchor, newText) => { const a = __nodes(); const i = a.findIndex((n) => n.textContent.trim() === anchor); if (i >= 0) a[i + 1].textContent = newText };
  window.__btn = (t) => [...document.querySelectorAll('button')].find((b) => b.innerText.replace(/\\s+/g, ' ').trim().endsWith(t));
  window.__rect = (el, pad = 0) => { const r = el.getBoundingClientRect(); return { x: r.left - pad, y: r.top + scrollY - pad, width: r.width + pad * 2, height: r.height + pad * 2 } };
  true
`)

// A recording with its loudness track, so the talk bars come in all four
// colours: you, students, sound with no words, and quiet. The transcript and
// the talk shares stay as they are; every second between turns gets a
// loudness reading (long stretches of sound, shorter quiet ones), and the
// quiet / sound totals are set from that track so the bar and the chart agree.
// Wraps the preview's own fake fetch, then re-enters the page so the report
// is fetched through the wrapper.
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
await sleep(1800)

const SHARED = {
  'The decline and fall of the ancient Indian empires, through reading passages and a…': 'Cellular respiration: where a cell’s energy comes from',
  'The decline and fall of the ancient Indian empires': 'Cellular respiration: where a cell’s energy comes from',
  'Preview Teacher ·': 'Biology ·',
  '· 7th': '· 9th',
  'Recorded 22:38 · only 48% came through as audible speech — the quiet stretches are as likely to be distance or overlapping voices as a quiet room · 8 of 8 metrics measured from that portion':
    'Recorded 22:38 · 48% came through as audible speech · 8 of 8 metrics measured from that portion',
}
await evaluate(`
  __swap(${JSON.stringify({
    ...SHARED,
    'The lesson covers the decline and fall of ancient Indian empires—the Harappan (Indus River Valley), Mauryan, and Gupta civilizations—examining causes such as natural climate change, earthquakes, and rivers changing course, through reading passages and a simulation activity.':
      'The lesson covers cellular respiration — how cells turn glucose and oxygen into usable energy — moving from a modelled walk through the equation to small groups predicting what happens when oxygen runs short.',
    'The framing of internal bad choices versus external forces is a strong organizing lens for comparing why empires fall—next time you could have students sort the specific causes (climate shift, earthquakes, river course changes, leadership decisions) into those two buckets for each empire before the simulation starts, so the categories are active tools rather than background narration.':
      'After a student answers, ask one more “why?” before you move on — today you followed up on 3 of the 9 answers the recording could hear.',
    // Next lesson, try this: what went well and the one thing to try.
    'Your “bad choices vs. outside forces” framing gave students a strong lens.': 'Your “what if the cell had no oxygen?” question got students reasoning.',
    'Have pairs sort the causes into those two groups before the simulation starts.': 'After a student answers, ask one more “why?” before you move on.',
    // How the lesson moved: the stages, renamed for the invented lesson.
    'Reviewing prior empire topics': 'Recapping photosynthesis',
    'Introducing the fall-of-empires simulation': 'Walking through the respiration equation',
    'Harappan decline reading and questions': 'Groups predicting a cell short of oxygen',
  })});
  __after('From', 'Questioning & Checking');
  for (const n of __nodes()) if (/^[A-Z][a-z]{2} \\d{1,2}, \\d{4} at /.test(n.textContent.trim()) && n.parentElement.closest('header, [class*=bg-forest]')) n.textContent = 'Oct 14, 2026 at 10:05 AM';
  // Fixed bars (the phone tab bar, the help bubble) would be painted over a
  // full-page capture.
  for (const el of document.querySelectorAll('body *')) { const p = getComputedStyle(el).position; if (p === 'fixed' || p === 'sticky') el.style.display = 'none' }
  // The back link and speaker fix are page chrome, not the report.
  for (const t of ['← Back to sessions']) { const el = [...document.querySelectorAll('a,button')].find((e) => e.innerText.trim() === t); if (el) el.parentElement.style.visibility = 'hidden' }
  true
`)
console.log('coverage line:', await evaluate(`__nodes().map((n) => n.textContent.trim()).find((t) => t.startsWith('Recorded '))`))
await sleep(300)

const shoot = async (name, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true })
  writeFileSync(join(OUT, name), Buffer.from(r.result.data, 'base64'))
  console.log('wrote', name, Math.round(clip.width), 'x', Math.round(clip.height))
}

// 1. Summary: from the report title down to the row of the lesson's numbers.
const summaryClip = await evaluate(`(() => {
  const top = [...document.querySelectorAll('p,span')].find((e) => e.textContent.trim() === 'Wivoza · Lesson Debrief');
  const tile = [...document.querySelectorAll('p')].find((e) => e.textContent.trim() === 'TAWT');
  const t = top.getBoundingClientRect().top + scrollY - 20;
  const b = tile.closest('.grid').getBoundingClientRect().bottom + scrollY + 16;
  return { x: 0, y: t, width: ${W}, height: b - t };
})()`)
const summaryLeak = await evaluate(`(() => { const m = (() => { const t = document.querySelector('main').innerText; return t.slice(0, t.indexOf('How to read these numbers')) })().match(/empire|Gupta|Harappan|Mauryan|Indus|bromine|Moroccan/gi); return m })()`)
if (summaryLeak) throw new Error('real-lesson words left in the Summary: ' + summaryLeak.join(', '))
await shoot('debrief-summary.png', summaryClip)

// 2. Questioning & Checking: the questions-and-checks card.
await evaluate(`__btn('Insights').click()`)
await sleep(800)
await evaluate(`__btn('Questioning').click()`)
await sleep(1200)
await evaluate(`
  __swap(${JSON.stringify({
    ...SHARED,
    'Based on the past, what do you think was the main cause for the fall of the bromine business?': 'Why do you think the cell needs oxygen at the very end of the chain?',
    'So of the six right here, which one would you think would fall under earthquakes?': 'So which of the three stages would stop first if the oxygen ran out?',
    "So with that in mind, what do you think happened to the Moroccan civilization, or what's the most likely thing that happened to them?": 'With that in mind, what do you think happens inside a muscle cell during a sprint?',
    'So who here knows what a transitional phrase is?': 'So who can explain why yeast makes bread dough rise?',
  })});
  true
`)
await sleep(300)
const qClip = await evaluate(`(() => {
  const h = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Your questions and checks');
  const end = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === '22:02');
  let card = h; while (card && !(card.getBoundingClientRect().width > ${W} * 0.8 && card.contains(end))) card = card.parentElement;
  const r = card.getBoundingClientRect();
  const b = end.getBoundingClientRect().bottom + scrollY + 20;
  return { x: r.left - 20, y: r.top + scrollY - 20, width: r.width + 40, height: b - (r.top + scrollY) + 20 };
})()`)
await shoot('debrief-questions.png', qClip)

// 3. Talk & Participation: the recording, minute by minute.
await evaluate(`__btn('Talk & Participation').click()`)
await sleep(1200)
// From the three numbers (you, students, your pace) down to the minute-by-
// minute bars' time axis. The section's note above them is about this
// lesson's subject, so it stays out.
const talkClip = await evaluate(`(() => {
  const leaf = (t) => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === t);
  const pace = leaf('Your pace')[0]; const studentsTile = leaf('Students').find((e) => e.compareDocumentPosition(pace) & Node.DOCUMENT_POSITION_FOLLOWING);
  let row = pace; while (row && !row.contains(studentsTile)) row = row.parentElement;
  const h = leaf('Your recording, minute by minute')[0];
  let card = h; while (card && card.getBoundingClientRect().height < 120) card = card.parentElement;
  const axis = leaf('0:00').filter((e) => card.contains(e)).pop();
  const c = card.getBoundingClientRect();
  const top = row.getBoundingClientRect().top + scrollY - 16;
  const bottom = axis.getBoundingClientRect().bottom + scrollY + 22;
  return { x: c.left - 16, y: top, width: c.width + 32, height: bottom - top };
})()`)
await shoot('debrief-talk.png', talkClip)

// 4. My Growth with a focus picked: one measure across six lessons.
await evaluate(`__btn('Growth').click()`)
await sleep(900)
await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.includes('Choose a focus metric')).click()`)
await sleep(500)
await evaluate(`[...document.querySelectorAll('button,[role=option]')].find((b) => b.innerText.trim() === 'Your share of the talk').click()`)
await sleep(1200)
const growthClip = await evaluate(`(() => {
  const h = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Your focus').pop();
  let card = h; while (card && card.getBoundingClientRect().height < 200) card = card.parentElement;
  const r = card.getBoundingClientRect();
  return { x: r.left - 16, y: r.top + scrollY - 16, width: r.width + 32, height: r.height + 32 };
})()`)
await shoot('debrief-growth.png', growthClip)

// Fail loudly if any of the real lesson's words survived into either view.
const leak = await evaluate(`document.querySelector('main').innerText.match(/bromine|Moroccan|empire|Gupta|Harappan|transitional phrase/gi)`)
console.log('leftover real-lesson words in the questions view:', leak)
ws.close()
chrome.kill()
