// What the report picks out and what it suggests — shared by the screen
// report and the printable one.
//
// These lived inside AudioCoaching.tsx, which meant the PDF could not reach
// them: a teacher's export carried the measurements and none of the
// interpretation — no strength the report had named, no suggestions. Kept in
// one place rather than copied, because a second implementation of "what this
// lesson suggests" would drift from the first and nobody would notice which
// one a coach was reading.
import type {
  AudioHighlight,
  AudioSessionWithSegments,
  FocusMetric,
} from './api'
import {
  hasEnoughWaitTimeSamples,
  MIN_CFU_FOR_STRENGTH,
  MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC,
  type ConfidentMetric,
} from './reportConfidence'

const CANDIDATE_ORDER = [
  'highlight-followup',
  'highlight-redirection',
  'highlight-repeated',
  'highlight-monologue',
  'talk-balance',
  'questioning',
  'wait-time',
  'cfu',
  'feedback',
]


function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export type NoticeCandidate = {
  id: string
  observation: string
  whyItMatters: string
  timestampSec: number | null
  excerpt: string | null
  durationSec: number | null
  weight: number
  focusMetric: FocusMetric | null
  /** What the report actually measured, for Reflect's coach when the label alone carries no data. */
  detail?: string
}
export function pickTop(candidates: NoticeCandidate[], preferredFocusMetric?: FocusMetric | null): NoticeCandidate | null {
  if (!candidates.length) return null
  const sorted = [...candidates].sort(
    (a, b) => b.weight - a.weight || CANDIDATE_ORDER.indexOf(a.id) - CANDIDATE_ORDER.indexOf(b.id),
  )
  if (preferredFocusMetric) {
    const focused = sorted.find((c) => c.focusMetric === preferredFocusMetric)
    if (focused) return focused
  }
  return sorted[0]
}
export function highlightCandidates(
  highlights: AudioHighlight[] | null,
  label: string,
  id: string,
  weight: number,
  whyItMatters: string,
): NoticeCandidate[] {
  return (highlights ?? [])
    .filter((h) => h.label === label)
    .map((h) => ({
      id,
      observation: h.label,
      whyItMatters,
      timestampSec: h.timestampSec,
      excerpt: h.excerpt,
      durationSec: h.durationSec ?? null,
      weight,
      focusMetric: null,
    }))
}
export function buildStrengthCandidates(
  session: AudioSessionWithSegments,
  cfuMetric: ConfidentMetric,
  feedbackRatio: ConfidentMetric,
  higherOrderRatio: ConfidentMetric | null,
): NoticeCandidate[] {
  const candidates: NoticeCandidate[] = []

  candidates.push(
    ...highlightCandidates(
      session.highlights,
      'Follow-up / probing question',
      'highlight-followup',
      3,
      'Following up on a student answer pushes their thinking further instead of stopping at the first response.',
    ),
  )

  const hasEnoughDurationForTalkBalance =
    session.durationSec != null && session.durationSec >= MIN_DURATION_FOR_TALK_BALANCE_CANDIDATE_SEC

  // A high student share is deliberately NOT offered here as something that
  // went well. It is the one number in this report that reads identically
  // whether the lesson was a strong discussion or a room that got away from
  // the teacher, so listing it among things worth noticing endorsed one
  // reading of it. It stays on the Talk & Participation page, as a
  // measurement rather than a compliment.

  if (
    higherOrderRatio &&
    higherOrderRatio.state === 'measured' &&
    session.higherOrderPct != null &&
    session.higherOrderPct >= 40
  ) {
    candidates.push({
      id: 'questioning',
      observation: `${session.higherOrderPct}% of your questions were higher-order`,
      whyItMatters: "That's the harder kind of question to ask on the fly — it pushes for real thinking, not just recall.",
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'higherOrderPct',
    })
  }

  if (
    hasEnoughDurationForTalkBalance &&
    hasEnoughWaitTimeSamples(session.metricsDetail) &&
    session.avgWaitTimeSec != null &&
    session.avgWaitTimeSec >= 3
  ) {
    candidates.push({
      id: 'wait-time',
      observation: `Your average wait time was ${session.avgWaitTimeSec}s`,
      whyItMatters: 'Giving students real time to think before answering leads to deeper, more complete responses.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'avgWaitTime',
    })
  }

  // Stated with its number so this claim cannot drift away from the count the
  // teacher is reading two cards below it.
  if (cfuMetric.state === 'measured' && (session.cfuCount ?? 0) >= MIN_CFU_FOR_STRENGTH) {
    candidates.push({
      id: 'cfu',
      observation: `You checked for understanding ${session.cfuCount} times today`,
      whyItMatters: 'Catching confusion before it compounds is one of the highest-leverage coaching moves.',
      timestampSec: null,
      excerpt: null,
      durationSec: null,
      weight: 1,
      focusMetric: 'cfuCount',
    })
  }

  if (feedbackRatio.state === 'measured' && feedbackRatio.display.endsWith('%')) {
    const pct = parseInt(feedbackRatio.display, 10)
    if (!Number.isNaN(pct) && pct >= 50) {
      candidates.push({
        id: 'feedback',
        observation: `${feedbackRatio.display} of your feedback was specific`,
        whyItMatters: 'Specific feedback gives students something concrete to act on, not just praise or correction.',
        timestampSec: null,
        excerpt: null,
        durationSec: null,
        weight: 1,
        focusMetric: 'feedbackSpecificity',
      })
    }
  }

  return candidates
}
export function formatCandidateHeadline(candidate: NoticeCandidate): string {
  if (candidate.durationSec != null && candidate.timestampSec != null) {
    return `${candidate.observation}: ${Math.round(candidate.durationSec)}s — occurred at ${formatTime(candidate.timestampSec)}`
  }
  if (candidate.timestampSec != null) {
    return `${candidate.observation} · ${formatTime(candidate.timestampSec)}`
  }
  return candidate.observation
}

export type NextTimeItem = { id: string; from: string; text: string; lead?: string }

/// Everything the report suggests, in one list: the moment to revisit's own
/// step, one line per Insights section, and the two content notes that point
/// forward. Each names where it came from, so a teacher can go and read the
/// evidence behind it. "Worth double-checking" notes are left out — a caution
/// about possible content errors is not something to build a lesson on.
export function buildNextTimeItems(session: AudioSessionWithSegments): NextTimeItem[] {
  const items: NextTimeItem[] = []
  const add = (id: string, from: string, text: string | null | undefined, lead?: string) => {
    if (text?.trim()) items.push({ id, from, text: text.trim(), lead })
  }
  const moment = session.momentToRevisit
  add('moment', 'Moment to revisit', moment?.status === 'found' ? moment.tryNext : null)
  add('talk', 'Talk & Participation', session.nextSteps?.talk)
  add('questions', 'Questioning & Checking', session.nextSteps?.questions)
  const notes = session.contentNotes?.notes ?? []
  add(
    'content-further',
    'Take further · Clarity & Content',
    notes.find((n) => n.label === 'Where it could go further')?.text,
    'Take this further',
  )
  add('climate', 'Climate & Routines', session.nextSteps?.climate)
  add('content-worked', 'Keep doing · Clarity & Content', notes.find((n) => n.label === 'What worked')?.text, 'Keep doing this')
  return items
}
