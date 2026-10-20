// One strength from a lesson, in the teacher's own words — Home's "Keep
// doing" card. Chosen the way the report's Summary chooses its Keep doing: a
// question that asked students to reason (justify, compare, judge), else one
// that asked them to explain; failing those, a follow-up that pushed a
// student further, then the content specialist's "What worked" note.
// Questions are sorted as AudioCoaching.tsx's classifyQuestions sorts them.

import type { AudioSession } from './api'

export type KeepDoing = { text: string; quote: string; timestampSec: number }

const KIND_TO_MIX: Record<string, 'recall' | 'explain' | 'reasoning'> = {
  recall: 'recall',
  explain: 'explain',
  justify: 'reasoning',
  compare: 'reasoning',
  evaluate: 'reasoning',
}

/// A name set off by commas the way direct address is ("Shania, what…").
const NOT_NAMES = new Set(['okay', 'ok', 'so', 'now', 'well', 'yes', 'yeah', 'alright', 'right', 'and', 'but', 'guys', 'everyone', 'everybody', 'class', 'folks', 'friends', 'sure', 'wait', 'really', 'hmm', 'um', 'good', 'great', 'perfect', 'exactly', 'nice'])
const ADDRESSED = /(^|[,.!?]\s*)(\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*)(?=\s*[,?])/gu
export function withoutAddressedNames(text: string): string {
  return text.replace(ADDRESSED, (whole, lead: string, word: string) => (NOT_NAMES.has(word.toLowerCase()) ? whole : `${lead}[name]`))
}

const EXTEND_TEXT: Record<string, string> = {
  build_on_peer: 'You asked students to build on each other’s ideas.',
  reasoning: 'You asked a student for their reasoning, not just the answer.',
  probe: 'You asked a student to say more.',
}

export function keepDoing(session: AudioSession): KeepDoing | null {
  const kinds = session.teachingMoves?.questionKinds ?? []
  const questions = (session.questionLog ?? []).map((q) => {
    const kind = kinds.find((k) => Math.abs(k.timestampSec - q.timestampSec) <= 4)?.kind
    const mix = kind ? (KIND_TO_MIX[kind] ?? 'recall') : q.type === 'higher_order' ? 'explain' : 'recall'
    return { q, mix }
  })
  const reasoning = questions.filter((x) => x.mix === 'reasoning')
  const explain = questions.filter((x) => x.mix === 'explain')
  const pick = reasoning[0] ?? explain[0]
  if (pick) {
    return {
      text:
        reasoning.length > 0
          ? `You asked students to justify, compare or judge ${reasoning.length} time${reasoning.length === 1 ? '' : 's'}, not just answer.`
          : `You asked students to explain their thinking ${explain.length} time${explain.length === 1 ? '' : 's'}.`,
      quote: withoutAddressedNames(pick.q.text),
      timestampSec: pick.q.timestampSec,
    }
  }
  const extending = session.teachingMoves?.participation?.extending ?? []
  const ext =
    extending.find((e) => e.kind === 'build_on_peer') ?? extending.find((e) => e.kind === 'reasoning') ?? extending[0]
  if (ext) return { text: EXTEND_TEXT[ext.kind] ?? EXTEND_TEXT.probe, quote: withoutAddressedNames(ext.quote), timestampSec: ext.timestampSec }
  const worked = session.contentNotes?.notes.find((n) => n.label === 'What worked')
  if (worked) return { text: worked.text, quote: withoutAddressedNames(worked.excerpt), timestampSec: worked.timestampSec }
  return null
}
