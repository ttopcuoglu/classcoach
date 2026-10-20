// Placing a moment the teacher said in the transcript, with the teacher's
// lines that follow it — the window the checks read (lib/checksLoop.ts) reads
// for what the teacher did next. Kept from lib/heldOpen.ts when that read
// was rolled back.

import type { Segment } from './audioAnalysis.ts'
import { normalizeForMatch } from './lessonObjective.ts'

/// One of the teacher's lines after a question, or the rest of the line the
/// question was asked in (L0).
export type WindowLine = {
  n: number
  text: string
  startSec: number
  endSec: number
  /// Start of the transcript line it comes from — for L0, the question's own.
  segStartSec: number
}

export function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/// Where `phrase` sits in `text`, as a fraction of the way through it, or
/// null. Compared normalized, so punctuation and case do not matter.
export function fractionOf(phrase: string, text: string): { from: number; to: number } | null {
  const p = normalizeForMatch(phrase)
  const t = normalizeForMatch(text)
  if (!p || !t) return null
  const at = t.indexOf(p)
  if (at === -1) return null
  return { from: at / t.length, to: (at + p.length) / t.length }
}

/// The teacher's speech as one normalized string, with each line's span in
/// it, so a question that runs across two of the teacher's lines can still be
/// found, and where it ends placed inside the line it ends in.
function teacherFlat(teacher: Segment[]) {
  const spans: { at: number; end: number; seg: Segment; norm: string }[] = []
  let flat = ''
  for (const seg of teacher) {
    const norm = normalizeForMatch(seg.text)
    if (!norm) continue
    if (flat) flat += ' '
    spans.push({ at: flat.length, end: flat.length + norm.length, seg, norm })
    flat += norm
  }
  return { flat, spans }
}

/// A moment the teacher said, placed in the transcript, with the teacher's
/// lines that follow it inside `windowSec` — used by the checks read
/// (lib/checksLoop.ts). Null when the words cannot be found in
/// the teacher's speech near `timestampSec`, so the moment cannot be timed.
export type Placed = { startSec: number; endSec: number; lines: WindowLine[]; others: number[] }

export function teacherSpeech(segments: Segment[]) {
  const spoken = segments.filter((s) => s.text.trim())
  const teacher = spoken.filter((s) => s.speakerLabel === 'Teacher')
  return { spoken, teacher, flat: teacherFlat(teacher) }
}

export function placeWithWindow(
  text: string,
  timestampSec: number,
  speech: ReturnType<typeof teacherSpeech>,
  windowSec: number,
): Placed | null {
  const { spoken, teacher, flat: t } = speech
  const needle = normalizeForMatch(text)
  if (!needle) return null
  // Every place the words occur; the one starting nearest the logged time.
  let best: { at: number; gap: number } | null = null
  for (let at = t.flat.indexOf(needle); at !== -1; at = t.flat.indexOf(needle, at + 1)) {
    const span = t.spans.find((s) => s.end > at)!
    const gap = Math.abs(span.seg.startSec - timestampSec)
    if (!best || gap < best.gap) best = { at, gap }
  }
  if (!best || best.gap > 15) return null
  const endAt = best.at + needle.length
  const startSpan = t.spans.find((s) => s.end > best!.at)!
  const endSpan = t.spans.find((s) => s.end >= endAt)!
  const home = endSpan.seg
  const fraction = Math.min(1, Math.max(0, (endAt - endSpan.at) / Math.max(1, endSpan.norm.length)))
  const endSec = home.startSec + (home.endSec - home.startSec) * fraction
  const lines: WindowLine[] = []
  // What the teacher said after it in the same line: where a same-breath
  // answer shows up.
  const words = home.text.trim().split(/\s+/)
  const tailFrom = Math.round(words.length * fraction)
  const tail = words.slice(tailFrom).join(' ').trim()
  if (normalizeForMatch(tail).split(' ').filter(Boolean).length >= 2) {
    lines.push({ n: 0, text: tail, startSec: endSec, endSec: home.endSec, segStartSec: home.startSec })
  }
  let n = 1
  for (const s of teacher) {
    if (s.startSec < home.endSec - 0.01 || s === home) continue
    if (s.startSec > endSec + windowSec) break
    const kept = s.text.trim()
    if (kept) lines.push({ n: n++, text: kept, startSec: s.startSec, endSec: s.endSec, segStartSec: s.startSec })
  }
  const others = spoken
    .filter((s) => s.speakerLabel !== 'Teacher' && s.startSec >= endSec - 0.01 && s.startSec <= endSec + windowSec)
    .map((s) => s.startSec)
  return { startSec: startSpan.seg.startSec, endSec, lines, others }
}

/// The numbered stretch after one moment, as the reads show it.
export function windowRows(placed: Placed): string[] {
  return [
    ...placed.lines.map((l) => ({ at: l.startSec, text: `  L${l.n} [${mmss(l.startSec)}] ${l.text}` })),
    ...placed.others.map((at) => ({ at, text: `  [${mmss(at)}] (someone else speaks)` })),
  ]
    .sort((a, b) => a.at - b.at)
    .map((r) => r.text)
}

