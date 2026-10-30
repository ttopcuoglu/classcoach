// What a lesson's questions asked of students, in the three kinds a teacher
// sees on Questioning & Checking: recall, explain, reasoning.
//
// A server mirror of classifyQuestions in web/src/pages/AudioCoaching.tsx, so
// a staff-wide figure is the same arithmetic as the "X of Y questions went
// beyond recall" a teacher reads on each lesson. Each counted question
// (questionLog) takes the finer kind the teaching-moves read gave it, matched
// by time; a question that read didn't place falls back to the older
// recall / higher-order split, with higher-order reading as explain.

export const MIX_KINDS = ['recall', 'explain', 'reasoning'] as const
export type MixKind = (typeof MIX_KINDS)[number]

/// Both vocabularies: Bloom's revised, stored since 2026-10-26, and the words
/// used before it. Without the Bloom's names every question read since then
/// fell to recall here, so a staff "beyond recall" figure counted an
/// "understand" or "analyze" question as recall.
const KIND_TO_MIX: Record<string, MixKind> = {
  remember: 'recall',
  understand: 'explain',
  apply: 'explain',
  analyze: 'reasoning',
  evaluate: 'reasoning',
  create: 'reasoning',
  recall: 'recall',
  explain: 'explain',
  justify: 'reasoning',
  compare: 'reasoning',
}

/// Seconds either side a teaching-moves quote may sit from the question it
/// labels. The same window the lesson page uses.
const MATCH_WINDOW_SEC = 4

export type MixCounts = Record<MixKind, number>

/// The lesson page's test for a question the teacher answered themself
/// (sameMoment in AudioCoaching.tsx): close in time, same opening words.
function sameMoment(a: { timestampSec: number; text: string }, b: { timestampSec: number; quote: string }): boolean {
  const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const na = norm(a.text)
  const nb = norm(b.quote)
  return Math.abs(a.timestampSec - b.timestampSec) <= 8 && na.length > 0 && nb.length > 0 && (na.startsWith(nb.slice(0, 20)) || nb.startsWith(na.slice(0, 20)))
}

export function questionMixOf(questionLog: unknown, teachingMoves: unknown): MixCounts {
  const counts: MixCounts = { recall: 0, explain: 0, reasoning: 0 }
  if (!Array.isArray(questionLog)) return counts
  const rawKinds = (teachingMoves as { questionKinds?: unknown } | null)?.questionKinds
  const kinds = Array.isArray(rawKinds)
    ? rawKinds.filter(
        (k): k is { timestampSec: number; kind: string } =>
          typeof k?.timestampSec === 'number' && typeof k?.kind === 'string',
      )
    : []
  // A question the teacher answered before a student could is not counted,
  // as the lesson page leaves it out.
  const rawSelf = (teachingMoves as { selfAnswered?: unknown } | null)?.selfAnswered
  const selfAnswered = Array.isArray(rawSelf)
    ? rawSelf.filter((s): s is { timestampSec: number; quote: string } => typeof s?.timestampSec === 'number' && typeof s?.quote === 'string')
    : []
  for (const q of questionLog as { timestampSec?: unknown; type?: unknown; text?: unknown }[]) {
    if (typeof q?.timestampSec !== 'number') continue
    const text = typeof q.text === 'string' ? q.text : ''
    if (selfAnswered.some((sa) => sameMoment({ timestampSec: q.timestampSec as number, text }, sa))) continue
    const kind = kinds.find((k) => Math.abs(k.timestampSec - (q.timestampSec as number)) <= MATCH_WINDOW_SEC)?.kind
    const mix: MixKind = kind ? (KIND_TO_MIX[kind] ?? 'recall') : q.type === 'higher_order' ? 'explain' : 'recall'
    counts[mix]++
  }
  return counts
}

/// Every lesson's questions added together, and how many lessons had any.
export function staffQuestionMix(sessions: { questionLog: unknown; teachingMoves: unknown }[]) {
  const totals: MixCounts = { recall: 0, explain: 0, reasoning: 0 }
  let lessons = 0
  for (const s of sessions) {
    const c = questionMixOf(s.questionLog, s.teachingMoves)
    const n = c.recall + c.explain + c.reasoning
    if (n === 0) continue
    lessons++
    for (const k of MIX_KINDS) totals[k] += c[k]
  }
  const questions = totals.recall + totals.explain + totals.reasoning
  return {
    counts: totals,
    questions,
    lessons,
    beyondRecallPct: questions > 0 ? Math.round(((totals.explain + totals.reasoning) / questions) * 100) : null,
  }
}
