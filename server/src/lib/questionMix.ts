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

const KIND_TO_MIX: Record<string, MixKind> = {
  recall: 'recall',
  explain: 'explain',
  justify: 'reasoning',
  compare: 'reasoning',
  evaluate: 'reasoning',
}

/// Seconds either side a teaching-moves quote may sit from the question it
/// labels. The same window the lesson page uses.
const MATCH_WINDOW_SEC = 4

export type MixCounts = Record<MixKind, number>

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
  for (const q of questionLog as { timestampSec?: unknown; type?: unknown }[]) {
    if (typeof q?.timestampSec !== 'number') continue
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
