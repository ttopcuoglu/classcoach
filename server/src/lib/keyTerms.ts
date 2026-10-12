// Academic vocabulary: which of the lesson's own terms were said, and by whom.
//
// The word clouds count every word of four letters or more, so "people" and
// "really" sit beside "feudalism" — a picture of what was said often, not of
// the vocabulary the lesson was teaching. Deciding which words are academic
// for THIS lesson is a judgment ("table" is one in chemistry and not in
// history), so the model that already reads the transcript names the terms
// (see lessonObjective.ts). Everything after that is counting, done here,
// because counting is the part that can be exact.
//
// The number worth having is the second one: a teacher who said
// "photosynthesis" fourteen times to students who said it twice has learned
// something no word cloud shows.

import type { Segment } from './audioAnalysis.ts'

export type KeyTerm = { term: string; teacherCount: number; studentCount: number }

export const MAX_KEY_TERMS = 10

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/// Whole words only, with a plain plural allowed on the end — "enzyme" counts
/// "enzymes", and does not count "coenzyme". Run against normalised text, so
/// the term's own characters need no escaping.
function countIn(text: string, term: string): number {
  return (text.match(new RegExp(`(?<![a-z0-9])${term}(?:e?s)?(?![a-z0-9])`, 'g')) ?? []).length
}

/// One speaker's words as a single string, so a two-word term split across a
/// pause — Deepgram segments on pauses, not sentences — is still one use.
function speech(segments: Segment[], speakerLabel: 'Teacher' | 'Student'): string {
  return segments
    .filter((s) => s.speakerLabel === speakerLabel)
    .map((s) => normalize(s.text))
    .filter(Boolean)
    .join(' ')
}

/// The model's list is a list of candidates. A term stays only if it is short
/// enough to be a term and the teacher actually said it — the model reads the
/// teacher's side, so a term found nowhere in it was supplied, not heard.
export function parseKeyTermLines(raw: string | null): string[] {
  if (!raw || /^\s*NONE\s*$/i.test(raw)) return []
  const out: string[] = []
  for (const line of raw.split(/[\n,]/)) {
    const term = line.trim().replace(/^[-•*\d.)\s]+/, '').replace(/^["']|["'.]+$/g, '').trim()
    if (!term || term.toUpperCase() === 'NONE') continue
    if (term.length > 40 || term.split(/\s+/).length > 3) continue
    if (!/^[A-Za-z][A-Za-z0-9 '-]*$/.test(term)) continue
    out.push(term)
  }
  return out
}

export function countKeyTerms(candidates: string[], segments: Segment[]): KeyTerm[] {
  const teacher = speech(segments, 'Teacher')
  const student = speech(segments, 'Student')
  const seen = new Set<string>()
  const terms: KeyTerm[] = []
  for (const candidate of candidates) {
    const key = normalize(candidate)
    // "enzymes" after "enzyme" would count the same uses twice.
    const singular = key.replace(/e?s$/, '')
    if (!key || seen.has(key) || seen.has(singular) || seen.has(`${key}s`)) continue
    const teacherCount = countIn(teacher, key)
    if (teacherCount === 0) continue
    seen.add(key)
    terms.push({ term: candidate.toLowerCase(), teacherCount, studentCount: countIn(student, key) })
    if (terms.length === MAX_KEY_TERMS) break
  }
  return terms.sort((a, b) => b.teacherCount + b.studentCount - (a.teacherCount + a.studentCount))
}
