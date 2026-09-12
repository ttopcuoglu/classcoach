// Measures the gap a teacher actually feels in Talk It Through: from the
// moment they stop talking to the moment Coach's voice starts. The server
// logs its own stages, but only the client can see the whole span — the
// silence timer, the upload, and the audio fetch all happen out here.
//
// Off by default; turned on per-browser so a slow session can be diagnosed
// on the machine it happened on:
//
//   localStorage.wivozaTiming = '1'    (or open the page with ?timing=1)
//
// Kept to console output on purpose. Sending timings to the server would
// mean shipping a teacher's session timing off their machine, which is not
// something this app should start doing for a debugging convenience.
let enabled = false
try {
  enabled =
    localStorage.getItem('wivozaTiming') === '1' ||
    new URLSearchParams(location.search).get('timing') === '1'
} catch {
  // Private mode or blocked storage — stay off.
}

let t0 = 0
let last = 0
let marks: string[] = []

export function beginTurn(): void {
  if (!enabled) return
  t0 = last = performance.now()
  marks = []
}

export function markTurn(name: string): void {
  if (!enabled || !t0) return
  const now = performance.now()
  marks.push(`${name}=${Math.round(now - last)}ms`)
  last = now
}

// Called when Coach's first word is actually audible — the number that
// matters. Everything after it is speech, not waiting.
export function endTurn(): void {
  if (!enabled || !t0) return
  console.log(`[timing] turn ${marks.join(' ')} to_first_audio=${Math.round(performance.now() - t0)}ms`)
  t0 = 0
}
