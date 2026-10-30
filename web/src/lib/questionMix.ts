// How many of a lesson's questions went beyond recall, sorted the way the
// Questioning card sorts them: each counted question (questionLog) takes the
// finer Bloom's kind the teaching-moves read gave it, matched by time, else
// the older recall / higher-order split. A question the teacher answered
// before a student could is left out, as the card leaves it out. For pages that show the count
// without the card — the printable report — so the two never disagree.
// The server mirror is server/src/lib/questionMix.ts.

import type { AudioSession } from './api'

const RECALL_KINDS = new Set(['remember', 'recall'])
const MATCH_WINDOW_SEC = 4

/// The card's own test for a self-answered question (sameMoment in
/// AudioCoaching.tsx): close in time and the same opening words.
function sameMoment(a: { timestampSec: number; text: string }, b: { timestampSec: number; quote: string }) {
  const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const na = norm(a.text)
  const nb = norm(b.quote)
  return Math.abs(a.timestampSec - b.timestampSec) <= 8 && na.length > 0 && nb.length > 0 && (na.startsWith(nb.slice(0, 20)) || nb.startsWith(na.slice(0, 20)))
}

export function beyondRecall(session: Pick<AudioSession, 'questionLog' | 'teachingMoves'>): { beyond: number; total: number } | null {
  const log = session.questionLog
  if (!log) return null
  const kinds = session.teachingMoves?.questionKinds ?? []
  const selfAnswered = session.teachingMoves?.selfAnswered ?? []
  const counted = log.filter((q) => !selfAnswered.some((sa) => sameMoment(q, sa)))
  let beyond = 0
  for (const q of counted) {
    const kind = kinds.find((k) => Math.abs(k.timestampSec - q.timestampSec) <= MATCH_WINDOW_SEC)?.kind
    if (kind ? !RECALL_KINDS.has(kind) : q.type === 'higher_order') beyond++
  }
  return { beyond, total: counted.length }
}
