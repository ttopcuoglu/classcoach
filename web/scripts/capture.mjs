// Shared by the sample capture scripts: drives headless Chrome over the
// DevTools Protocol (Node's built-in WebSocket, no dependencies) to render
// real app pages with every /api call answered from fixtures, then prints
// or screenshots them into public/samples/.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const APP = process.env.APP_URL ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = new URL('../public/samples/', import.meta.url).pathname
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Runs in the page before any app code. `route(pathname, searchParams)`
// is serialized into the page, so it must be self-contained.
function mockScript(fixtures, route) {
  return `(() => {
    const FIXTURES = ${JSON.stringify(fixtures)};
    const route = ${route.toString()};
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
      if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
      const key = route(url.pathname, url.searchParams);
      const body = key in FIXTURES ? FIXTURES[key] : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  })();`
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Chrome still starting
    }
    await sleep(200)
  }
  throw new Error('Chrome did not start')
}

function client(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      data.error ? reject(new Error(data.error.message)) : resolve(data.result)
    }
  }
  const ready = new Promise((r) => (ws.onopen = r))
  const send = async (method, params = {}) => {
    await ready
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  return { send, close: () => ws.close() }
}

// Runs `steps` with a page whose API is answered from `fixtures`, keyed by
// whatever `route` returns for a request (default: its pathname).
export async function withChrome({ fixtures, route = (pathname) => pathname }, steps) {
  const profile = mkdtempSync(join(tmpdir(), 'wivoza-capture-'))
  const chrome = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'],
    { stdio: 'ignore' },
  )
  try {
    const cdp = client(await connect())
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mockScript(fixtures, route) })

    const evaluate = async (expression) =>
      (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
    const api = {
      evaluate,
      viewport: (width, height = 1800) =>
        cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: false }),
      open: async (path) => {
        await cdp.send('Page.navigate', { url: APP + path })
        await sleep(2500)
      },
      pdf: async (file) => {
        const { data } = await cdp.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
        writeFileSync(join(OUT, file), Buffer.from(data, 'base64'))
        console.log(`✓ ${file}`)
      },
      // PNG of the union of the elements `pick` (a page-side function) returns.
      shoot: async (file, pick) => {
        const r = await evaluate(`(() => { const els = (${pick})().filter(Boolean); const rs = els.map(e => e.getBoundingClientRect());
          const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top)) + scrollY;
          const right = Math.max(...rs.map(r => r.right)), bottom = Math.max(...rs.map(r => r.bottom)) + scrollY;
          return { x: x - 16, y: y - 16, width: right - x + 32, height: bottom - y + 32 }; })()`)
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...r, scale: 1 } })
        writeFileSync(join(OUT, file), Buffer.from(data, 'base64'))
        console.log(`✓ ${file} (${Math.round(r.width)}×${Math.round(r.height)})`)
      },
      sleep,
    }
    await api.viewport(1280)
    await steps(api)
    cdp.close()
  } finally {
    // Chrome keeps writing to its profile until it has fully exited.
    const exited = new Promise((resolve) => chrome.once('exit', resolve))
    chrome.kill()
    await exited
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
