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
/// A name set off by commas the way direct address is — mirrors
/// withoutAddressedNames in web lib/keepDoing.ts, so a logged question and a
/// stored quote that already reads "[name]" compare the same way here as on
/// the card. Without it the server counted 14 questions where the card showed
/// 13 plus 2 answered.
const NOT_NAMES = new Set(['okay', 'ok', 'so', 'now', 'well', 'yes', 'yeah', 'alright', 'right', 'and', 'but', 'guys', 'everyone', 'everybody', 'class', 'folks', 'friends', 'sure', 'wait', 'really', 'hmm', 'um', 'good', 'great', 'perfect', 'exactly', 'nice'])
const ADDRESSED = /(^|[,.!?]\s*)(\p{Lu}\p{Ll}+(?:['’-]\p{L}+)*)(?=\s*[,?])/gu
function withoutAddressedNames(text: string): string {
  return text.replace(ADDRESSED, (whole, lead: string, word: string) => (NOT_NAMES.has(word.toLowerCase()) ? whole : `${lead}[name]`))
}

function sameMoment(a: { timestampSec: number; text: string }, b: { timestampSec: number; quote: string }): boolean {
  const norm = (q: string) => withoutAddressedNames(q).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const na = norm(a.text)
  const nb = norm(b.quote)
  return Math.abs(a.timestampSec - b.timestampSec) <= 8 && na.length > 0 && nb.length > 0 && (na.startsWith(nb.slice(0, 20)) || nb.startsWith(na.slice(0, 20)))
}

/// A one-word question is not counted as a question: "Right?" "K?" "2?"
/// "Why?". On a room mic these are mostly tags, echoes and students' answers
/// read back, not questions left with the class (decided 2026-11-02). Mirrors
/// isCountedQuestion in AudioCoaching.tsx and the iPhone's ThinkingPause.
export function isCountedQuestion(text: string): boolean {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length !== 1
}

/// Words a yes/no question opens with.
const YES_NO_OPENERS = new Set([
  'is', 'are', 'was', 'were', 'am', 'do', 'does', 'did', 'can', 'could', 'would', 'will', 'should', 'shall', 'has', 'have', 'had',
  'may', 'might', 'must', "isn't", "aren't", "wasn't", "weren't", "don't", "doesn't", "didn't", "can't", "couldn't", "wouldn't",
  "won't", "shouldn't", "hasn't", "haven't",
])
/// Said before the question, not part of it: "So, is it…", "Okay is there…".
const LEAD_INS = new Set(['so', 'okay', 'ok', 'and', 'now', 'well', 'alright', 'um', 'uh', 'but', 'then', 'guys', 'right', 'yes', 'yeah', 'oh'])
/// Asks students to give the why or the how: never closed.
const OPEN_WORDS = /\b(why|how|explain|describe|justify|prove|convince|reason|because)\b/i
/// A wh-word after the opener makes it an indirect open question: "Can you
/// tell me what a residual is?" asks for the what, not a yes.
const WH_WORDS = /\b(what|what's|which|where|when|who|whom|whose)\b/i

/// A closed question by its wording: one answered yes or no — "Is there a dot
/// here that says 11 avocados?", "Would your statement work for the others
/// too?". Counted as Recall whatever the read made of it: the class answers
/// in a word, not with an explanation (decided 2026-11-02). Closed questions
/// that are not yes/no ("What's the direction?") the read itself is told to
/// call remember. Mirrors isClosedQuestion in AudioCoaching.tsx and the
/// iPhone's QuestionMix.
export function isClosedQuestion(text: string): boolean {
  if (OPEN_WORDS.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  const bare = (w: string) => w.toLowerCase().replace(/’/g, "'").replace(/[^a-z']/g, '')
  let i = 0
  // Lead-ins and a name the question is put to ("Sarah," "[name],").
  while (i < words.length - 1 && (LEAD_INS.has(bare(words[i])) || words[i].endsWith(','))) i++
  if (i >= words.length || !YES_NO_OPENERS.has(bare(words[i]))) return false
  return !WH_WORDS.test(words.slice(i + 1).join(' '))
}

export type CountedQuestion = { timestampSec: number; text: string; type?: unknown; mix: MixKind; check: boolean }

/// THE question list every number on a lesson is counted from — the server
/// mirror of countedQuestions in AudioCoaching.tsx: each logged question takes
/// the finer kind the teaching-moves read gave it (else the older split), and
/// the ones the teacher answered themself are set apart. The cards, the
/// summary, the Hard Look and the Rubric Lens all count from this.
export function countedQuestions(questionLog: unknown, teachingMoves: unknown): { questions: CountedQuestion[]; selfAnswered: number } {
  if (!Array.isArray(questionLog)) return { questions: [], selfAnswered: 0 }
  const rawKinds = (teachingMoves as { questionKinds?: unknown } | null)?.questionKinds
  const kinds = Array.isArray(rawKinds)
    ? rawKinds.filter(
        (k): k is { timestampSec: number; kind: string; check?: unknown } =>
          typeof k?.timestampSec === 'number' && typeof k?.kind === 'string',
      )
    : []
  const rawSelf = (teachingMoves as { selfAnswered?: unknown } | null)?.selfAnswered
  const selfList = Array.isArray(rawSelf)
    ? rawSelf.filter((x): x is { timestampSec: number; quote: string } => typeof x?.timestampSec === 'number' && typeof x?.quote === 'string')
    : []
  const questions: CountedQuestion[] = []
  let selfAnswered = 0
  for (const q of questionLog as { timestampSec?: unknown; type?: unknown; text?: unknown }[]) {
    if (typeof q?.timestampSec !== 'number') continue
    const at = q.timestampSec
    const text = typeof q.text === 'string' ? q.text : ''
    if (!isCountedQuestion(text)) continue
    // A question the teacher answered before a student could is not counted,
    // as the lesson page leaves it out.
    if (selfList.some((sa) => sameMoment({ timestampSec: at, text }, sa))) {
      selfAnswered++
      continue
    }
    const k = kinds.find((x) => Math.abs(x.timestampSec - at) <= MATCH_WINDOW_SEC)
    const read: MixKind = k ? (KIND_TO_MIX[k.kind] ?? 'recall') : q.type === 'higher_order' ? 'explain' : 'recall'
    const mix: MixKind = isClosedQuestion(text) ? 'recall' : read
    questions.push({ timestampSec: at, text, type: q.type, mix, check: k?.check != null && k.check !== false })
  }
  return { questions, selfAnswered }
}

export function questionMixOf(questionLog: unknown, teachingMoves: unknown): MixCounts {
  const counts: MixCounts = { recall: 0, explain: 0, reasoning: 0 }
  for (const q of countedQuestions(questionLog, teachingMoves).questions) counts[q.mix]++
  return counts
}

/// THE check count — mirrors checkCount in web lib/questionMix.ts: stored
/// checks the read did not set aside, plus counted questions tagged as checks
/// that the stored list does not already hold.
export function checkCount(session: { cfuLog: unknown; cfuCount?: number | null; questionLog: unknown; teachingMoves: unknown }): number | null {
  if (!Array.isArray(session.cfuLog)) return session.cfuCount ?? null
  const checks = (session.cfuLog as { timestampSec: number; loop?: { who?: string } }[]).filter((c) => c.loop?.who !== 'not_a_check')
  const tagged = countedQuestions(session.questionLog, session.teachingMoves).questions.filter(
    (q) => q.check && !checks.some((c) => Math.abs(c.timestampSec - q.timestampSec) <= MATCH_WINDOW_SEC),
  )
  return checks.length + tagged.length
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
