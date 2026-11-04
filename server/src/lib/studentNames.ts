// Students' names never reach the database, the report or the model.
//
// A lesson transcript is a record of what was said, and teachers say their
// students' names all lesson. So before a transcript is saved, every name the
// teacher uses to address someone is replaced with a stand-in — Student-A,
// Student-B, in the order they were first heard — everywhere it occurs in
// that lesson, possessives included. The stand-ins are shaped like names on
// purpose: Students Called On, names-used and the [name] masking in quotes all
// read name-shaped words set off as address, and they keep working unchanged.
//
// Which words are names is the same heuristic the report already trusts
// (extractCapitalizedWords + the content-vs-address rule in audioAnalysis.ts):
// a word counts only when it is used to address someone at least as often as
// it is mentioned, so a novel's protagonist or a historical figure stays.
// Imperfect both ways — a student only ever talked ABOUT is not caught, and a
// topic the teacher addressed like a person would be masked — which is what
// the dry run (scripts/dryRunNameMasking.ts) is for.
//
// Runs on every speaker's lines: this happens at transcription, before the
// teacher says which voice is theirs. Each name is replaced word-for-word, so
// a line's word count — and the per-word speakerConfidence runs — stay aligned.

import { extractCapitalizedWords } from './audioAnalysis.ts'

const STAND_IN = /^Student-[A-Z]+$/

/// "Ms. Rivera": a title the transcript capitalizes and the report's
/// heuristic reads as a name. The adult after it is not a student either, and
/// is left as said.
const TITLES = new Set(['Ms', 'Mr', 'Mrs', 'Mx', 'Dr', 'Miss', 'Mister', 'Coach', 'Sir', 'Madam'])

/// A dash starts a new thought as surely as a full stop: "Let's go back —
/// Danny, you had your hand up". Read that way for masking only, so the
/// report's own counts are untouched.
function forDetection(text: string): string {
  return text.replace(/\s*[—–]\s*/g, '. ')
}

function standIn(n: number): string {
  let label = ''
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) label = String.fromCharCode(65 + (i % 26)) + label
  return `Student-${label}`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/// The names to mask in one lesson, each with its stand-in, in the order
/// first heard. Stand-ins already in the text (a lesson masked before) are
/// left alone and their letters are not reused, so running this twice changes
/// nothing.
export function studentNameStandIns(texts: string[]): Map<string, string> {
  const addressedCounts = new Map<string, number>()
  const contentCounts = new Map<string, number>()
  const firstHeard: string[] = []
  const taken = new Set<string>()
  for (const text of texts) {
    for (const word of text.split(/\s+/)) {
      const cleaned = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
      if (STAND_IN.test(cleaned)) taken.add(cleaned)
    }
    const { addressed, content } = extractCapitalizedWords(forDetection(text))
    for (const word of addressed) {
      if (STAND_IN.test(word) || TITLES.has(word)) continue
      if (!addressedCounts.has(word)) firstHeard.push(word)
      addressedCounts.set(word, (addressedCounts.get(word) ?? 0) + 1)
    }
    for (const word of content) contentCounts.set(word, (contentCounts.get(word) ?? 0) + 1)
  }

  const standIns = new Map<string, string>()
  let next = 0
  for (const name of firstHeard) {
    if ((contentCounts.get(name) ?? 0) > (addressedCounts.get(name) ?? 0)) continue
    while (taken.has(standIn(next))) next++
    standIns.set(name, standIn(next))
    taken.add(standIn(next))
  }
  return standIns
}

/// The lesson's lines with every student name replaced by its stand-in.
/// Case-sensitive on purpose: "Will" the student is masked, "will" the verb
/// is not.
export function maskStudentNames(texts: string[]): { texts: string[]; namesMasked: number } {
  const standIns = studentNameStandIns(texts)
  if (standIns.size === 0) return { texts, namesMasked: 0 }
  const pattern = new RegExp(
    `(?<![\\p{L}'’-])(${[...standIns.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})(?![\\p{L}-])`,
    'gu',
  )
  return {
    texts: texts.map((text) => text.replace(pattern, (name: string) => standIns.get(name) ?? name)),
    namesMasked: standIns.size,
  }
}
