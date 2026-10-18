// Turning a stored quote back into the teacher's exact words.
//
// The reads store what the model wrote, checked against the teacher's speech
// only loosely — case, punctuation and spacing ignored — because the model
// tidies as it copies. That check proves the sentence was said; it does not
// make the stored string verbatim. So before a quote is shown it is found in
// the transcript and replaced by the characters the transcript actually holds.
//
// A quote may run across the teacher's own back-to-back lines: Deepgram splits
// one sentence at every pause, so "Alright." / "So" / "we're going to make a
// list" is one thing said. It may never join lines another voice or a long
// pause came between — that would be stitching two moments into one.

import type { TranscriptSegment } from './api'

/// Teacher lines closer than this are one stretch of speech, split by the
/// transcriber rather than by anything that happened in the room.
export const JOIN_GAP_SEC = 1.5

export type Verbatim = {
  /// Exactly as the transcript holds it.
  text: string
  /// The line the quote starts in, and the one it ends in (often the same).
  segmentId: string
  endSegmentId: string
}

type Run = { segments: TranscriptSegment[]; text: string; starts: number[] }

/// The teacher's speech as runs of back-to-back lines, each run joined with
/// single spaces, remembering where each line starts within it.
export function teacherRuns(segments: TranscriptSegment[]): Run[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec)
  const runs: Run[] = []
  let current: TranscriptSegment[] = []
  const close = () => {
    if (current.length === 0) return
    const starts: number[] = []
    let text = ''
    for (const s of current) {
      if (text) text += ' '
      starts.push(text.length)
      text += s.text.trim()
    }
    runs.push({ segments: current, text, starts })
    current = []
  }
  for (const s of ordered) {
    if (s.speakerLabel !== 'Teacher' || !s.text.trim()) {
      // Another voice ends the run; so does a blank line, which is the
      // transcriber's, not a pause the teacher took.
      if (s.speakerLabel !== 'Teacher') close()
      continue
    }
    const last = current[current.length - 1]
    if (last && s.startSec - last.endSec > JOIN_GAP_SEC) close()
    current.push(s)
  }
  close()
  return runs
}

/// Lowercased letters and digits with single spaces, and for each character
/// of that, where it came from in the original.
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i].toLowerCase()
    if (/[a-z0-9]/.test(c)) {
      norm += c
      map.push(i)
    } else if (norm && norm[norm.length - 1] !== ' ') {
      norm += ' '
      map.push(i)
    }
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1)
    map.pop()
  }
  return { norm, map }
}

function normalize(text: string): string {
  return normalizeWithMap(text).norm
}

/// Punctuation that belongs to the end of what was said, kept with it.
const TRAILING = /^[.?!,;:…"'”’)]+/

function locate(run: Run, quote: string): Verbatim | null {
  const target = normalize(quote)
  if (!target) return null
  const { norm, map } = normalizeWithMap(run.text)
  // Whole words only: "the" must not match inside "other".
  let at = -1
  let from = 0
  while (from <= norm.length) {
    const i = norm.indexOf(target, from)
    if (i === -1) break
    const startsWord = i === 0 || norm[i - 1] === ' '
    const endsWord = i + target.length === norm.length || norm[i + target.length] === ' '
    if (startsWord && endsWord) {
      at = i
      break
    }
    from = i + 1
  }
  if (at === -1) return null
  const start = map[at]
  let end = map[at + target.length - 1] + 1
  const tail = run.text.slice(end).match(TRAILING)
  if (tail) end += tail[0].length
  const lineAt = (offset: number) => {
    let idx = 0
    run.starts.forEach((s, i) => {
      if (s <= offset) idx = i
    })
    return run.segments[idx]
  }
  return {
    text: run.text.slice(start, end),
    segmentId: lineAt(start).id,
    endSegmentId: lineAt(end - 1).id,
  }
}

/// The teacher's exact words for a stored quote, or null when they cannot be
/// found in one stretch of their own speech — and then the quote is not shown.
///
/// The run holding the stored timestamp is tried first; the stored timestamp is
/// the start of the line the quote begins in, so that is nearly always it.
export function resolveVerbatim(runs: Run[], quote: string, timestampSec: number): Verbatim | null {
  const holding = runs.find((r) => r.segments.some((s) => s.startSec === timestampSec))
  if (holding) {
    const hit = locate(holding, quote)
    if (hit) return hit
  }
  const byDistance = [...runs].sort(
    (a, b) => Math.abs(a.segments[0].startSec - timestampSec) - Math.abs(b.segments[0].startSec - timestampSec),
  )
  for (const run of byDistance) {
    if (run === holding) continue
    const hit = locate(run, quote)
    if (hit) return hit
  }
  return null
}
