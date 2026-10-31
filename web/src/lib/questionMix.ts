// How many of a lesson's questions went beyond recall, sorted the way the
// Questioning card sorts them: each counted question (questionLog) takes the
// finer Bloom's kind the teaching-moves read gave it, matched by time, else
// the older recall / higher-order split. A question the teacher answered
// before a student could is left out, as the card leaves it out. For pages that show the count
// without the card — the printable report — so the two never disagree.
// The server mirror is server/src/lib/questionMix.ts.

import type { AudioSession } from './api'
import { withoutAddressedNames } from './keepDoing'

const RECALL_KINDS = new Set(['remember', 'recall'])
const MATCH_WINDOW_SEC = 4

/// The card's own test for a self-answered question (sameMoment in
/// AudioCoaching.tsx): close in time and the same opening words.
function sameMoment(a: { timestampSec: number; text: string }, b: { timestampSec: number; quote: string }) {
  // Names hidden on both sides first, as the card compares them: a stored
  // quote can already read "[name]" where the logged question has the name.
  const norm = (q: string) => withoutAddressedNames(q).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const na = norm(a.text)
  const nb = norm(b.quote)
  return Math.abs(a.timestampSec - b.timestampSec) <= 8 && na.length > 0 && nb.length > 0 && (na.startsWith(nb.slice(0, 20)) || nb.startsWith(na.slice(0, 20)))
}

/// The questions the card counts, before sorting: the logged ones minus any
/// the teacher answered themself.
function counted(session: Pick<AudioSession, 'questionLog' | 'teachingMoves'>) {
  const selfAnswered = session.teachingMoves?.selfAnswered ?? []
  return (session.questionLog ?? []).filter((q) => !selfAnswered.some((sa) => sameMoment(q, sa)))
}

/// THE check count — the Summary tile, Questioning and the printable report
/// all show this one: stored checks the read did not set aside, plus counted
/// questions tagged as checks that the stored list does not already hold.
export function checkCount(session: Pick<AudioSession, 'questionLog' | 'teachingMoves' | 'cfuLog' | 'cfuCount'>): number | null {
  if (!session.cfuLog) return session.cfuCount ?? null
  const checks = session.cfuLog.filter((c) => c.loop?.who !== 'not_a_check')
  const kinds = session.teachingMoves?.questionKinds ?? []
  const tagged = counted(session).filter(
    (q) =>
      kinds.some((k) => Math.abs(k.timestampSec - q.timestampSec) <= MATCH_WINDOW_SEC && k.check) &&
      !checks.some((c) => Math.abs(c.timestampSec - q.timestampSec) <= MATCH_WINDOW_SEC),
  )
  return checks.length + tagged.length
}

export function beyondRecall(session: Pick<AudioSession, 'questionLog' | 'teachingMoves'>): { beyond: number; total: number } | null {
  const log = session.questionLog
  if (!log) return null
  const kinds = session.teachingMoves?.questionKinds ?? []
  const questions = counted(session)
  let beyond = 0
  for (const q of questions) {
    const kind = kinds.find((k) => Math.abs(k.timestampSec - q.timestampSec) <= MATCH_WINDOW_SEC)?.kind
    if (kind ? !RECALL_KINDS.has(kind) : q.type === 'higher_order') beyond++
  }
  return { beyond, total: questions.length }
}
