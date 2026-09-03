// A server-side port of AudioCoaching.tsx's buildPriorityCandidates +
// pickTop, scoped to admin reporting: which single coaching-priority theme
// a session's numbers point to, so it can be tallied across many sessions.
// Mirrors the same confidence gating as web/src/lib/reportConfidence.ts
// (MIN_N_FOR_PERCENT, MIN_DURATION_FOR_CFU_DETECTION_SEC) so a session
// never counts toward a priority its own report wouldn't have surfaced.
//
// Deliberately narrower than the in-report ranking: only the five
// metric-derived candidates are included here, not the three highlight-
// derived ones (Redirection cluster, Repeated instruction, Longest
// monologue) — those require scanning each session's highlights array,
// a reasonable follow-up but out of scope for this first pass.

const MIN_N_FOR_PERCENT = 10
export const MIN_DURATION_FOR_CFU_DETECTION_SEC = 3 * 60

export const PRIORITY_LABELS = ['talk-balance', 'questioning', 'wait-time', 'cfu', 'feedback'] as const
export type PriorityLabel = (typeof PRIORITY_LABELS)[number]

type RatioState = 'measured' | 'possible_detection' | 'not_measurable'

function ratioState(numerator: number, denominator: number): RatioState {
  if (denominator <= 0) return 'not_measurable'
  if (denominator < MIN_N_FOR_PERCENT) return 'possible_detection'
  return 'measured'
}

function talkBalanceKind(teacherPct: number | null, studentPct: number | null): string | null {
  if (teacherPct == null) return null
  if (teacherPct >= 65) return 'teacher-heavy'
  if (teacherPct <= 40 && studentPct != null && studentPct > teacherPct) return 'student-heavy'
  if (studentPct == null) return 'student-unmeasured'
  if (studentPct === 0) return 'student-zero'
  if (studentPct < 15) return 'student-thin'
  return 'balanced'
}

export type PrioritySessionInput = {
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number | null
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  durationSec: number | null
  metricsDetail: unknown
}

// Same fixed tie-break order as CANDIDATE_ORDER's non-highlight entries.
const TIE_BREAK_ORDER: PriorityLabel[] = ['talk-balance', 'questioning', 'wait-time', 'cfu', 'feedback']

export function topPriorityForSession(session: PrioritySessionInput): PriorityLabel | null {
  const recordedSec = session.durationSec ?? 0
  const detail = (session.metricsDetail ?? {}) as Record<string, unknown>
  const num = (key: string): number | null => (typeof detail[key] === 'number' ? (detail[key] as number) : null)

  const candidates: { id: PriorityLabel; weight: number }[] = []

  if (talkBalanceKind(session.teacherTalkPct, session.studentTalkPct) === 'teacher-heavy') {
    candidates.push({ id: 'talk-balance', weight: 2 })
  }

  if (session.questionCount != null) {
    const state = ratioState(num('higherOrderQuestionCount') ?? 0, session.questionCount)
    if (state === 'measured' && session.higherOrderPct != null && session.higherOrderPct < 40) {
      candidates.push({ id: 'questioning', weight: 1 })
    }
  }

  if (session.avgWaitTimeSec != null && session.avgWaitTimeSec < 3) {
    candidates.push({ id: 'wait-time', weight: 1 })
  }

  const cfuLimitedEvidence = recordedSec < MIN_DURATION_FOR_CFU_DETECTION_SEC
  if (!cfuLimitedEvidence && session.cfuCount === 0) {
    candidates.push({ id: 'cfu', weight: 1 })
  }

  const genericCount = num('genericFeedbackCount')
  const specificCount = num('specificFeedbackCount')
  if (genericCount != null && specificCount != null && genericCount + specificCount > 0) {
    if (ratioState(specificCount, genericCount + specificCount) === 'measured') {
      const pct = Math.round((specificCount / (genericCount + specificCount)) * 100)
      if (pct < 50) candidates.push({ id: 'feedback', weight: 1 })
    }
  }

  if (!candidates.length) return null
  return [...candidates].sort(
    (a, b) => b.weight - a.weight || TIE_BREAK_ORDER.indexOf(a.id) - TIE_BREAK_ORDER.indexOf(b.id),
  )[0].id
}
