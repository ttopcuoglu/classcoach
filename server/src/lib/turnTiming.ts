// One log line per request stage, so the Talk It Through delay can be
// attributed instead of guessed at. The stages are serial by construction
// (transcribe, then reply, then speech), so the question is never "is it
// slow" but "which stage owns the seconds" — and that is only answerable
// with real numbers from real sessions, not from local timings on a fast
// laptop with a warm connection.
//
// Deliberately always on: this costs one console line per turn, and turning
// it on only when something feels slow means never having the baseline to
// compare against.
export function startTiming(label: string) {
  const t0 = Date.now()
  let last = t0
  const marks: string[] = []
  return {
    // Time since the previous mark (or since start, for the first one).
    mark(name: string) {
      const now = Date.now()
      marks.push(`${name}=${now - last}ms`)
      last = now
    },
    end(extra?: Record<string, string | number>) {
      const tail = extra
        ? ' ' +
          Object.entries(extra)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')
        : ''
      console.log(`[timing] ${label} ${marks.join(' ')} total=${Date.now() - t0}ms${tail}`)
    },
  }
}
