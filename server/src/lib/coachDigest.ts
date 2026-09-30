import { prisma } from './prisma.ts'

// COACH_DIGEST_ENABLED takes either `true`, which switches the digest on for
// everyone, or a comma-separated list of emails, which switches it on for only
// those accounts. Anything else, including unset, is off for everybody.
//
// The list exists because the first real check of this feature found it fired
// on zero questions — the kind of failure that raises no error and that no
// amount of synthetic testing caught. Running it on one real account against
// real recordings for a few days is worth more than any staging environment,
// and it does not put a new toggle in front of every teacher to do it.
export type DigestRollout = { everyone: boolean; emails: Set<string> }

export function parseDigestRollout(raw: string | undefined): DigestRollout {
  const value = (raw ?? '').trim()
  if (value.toLowerCase() === 'true') return { everyone: true, emails: new Set() }
  const emails = value
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return { everyone: false, emails: new Set(emails) }
}

export function isDigestAllowed(rollout: DigestRollout, email: string | null | undefined): boolean {
  if (rollout.everyone) return true
  if (!email) return false
  return rollout.emails.has(email.trim().toLowerCase())
}

const ROLLOUT = parseDigestRollout(process.env.COACH_DIGEST_ENABLED)

/// Whether the digest is switched on for this account at all — before their own
/// consent is even considered.
export function digestAvailableFor(email: string | null | undefined): boolean {
  return isDigestAllowed(ROLLOUT, email)
}

// How many recordings back the trend line looks.
const TREND_SESSIONS = 4

// The columns the digest is allowed to read. Every one is already computed and
// paid for during analysis — the digest never triggers a Claude call of its own,
// which is what keeps it at roughly three cents a teacher a month.
const DIGEST_SELECT = {
  period: true,
  classSubject: true,
  gradeLevel: true,
  sessionDate: true,
  durationSec: true,
  teacherTalkPct: true,
  studentTalkPct: true,
  questionCount: true,
  higherOrderPct: true,
  avgWaitTimeSec: true,
  cfuCount: true,
  classSummary: true,
  strengths: true,
  growthAreas: true,
  nextStep: true,
} as const

export type DigestSession = {
  period: string | null
  classSubject: string | null
  gradeLevel: string | null
  sessionDate: Date
  durationSec: number | null
  teacherTalkPct: number | null
  studentTalkPct: number | null
  questionCount: number | null
  higherOrderPct: number | null
  avgWaitTimeSec: number | null
  cfuCount: number | null
  classSummary: string | null
  strengths: string | null
  growthAreas: string | null
  nextStep: string | null
}

// Which of the six focus areas the recording metrics can actually speak to.
// Talk share, question counts, wait time and checks for understanding say
// nothing useful about a defiance incident or a parent email, and a model handed
// numbers will reach for them anyway — so the numbers are withheld outside this
// area rather than being included with a request not to mention them.
const METRIC_RELEVANT_AREAS = new Set(['teaching_and_learning'])

export function metricsAreRelevant(focusAreaValue: string | null | undefined): boolean {
  return focusAreaValue != null && METRIC_RELEVANT_AREAS.has(focusAreaValue)
}

// Subject is the only room field both sides carry in comparable form: Debrief
// has subject/gradeBand ("6-8"), AudioSession has classSubject/gradeLevel, and
// their grade fields are not the same vocabulary.
function sameSubject(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

// What the digest is actually protecting against is Coach citing 3rd period's
// numbers at a question about 5th. A subject match is one way to prevent that,
// but it is not the only one — and requiring it would leave the digest silent
// for most questions, because Ask only collects a subject when the teacher
// picks Teaching and Learning up front (see debrief.ts's asksAboutContent).
// Every other question arrives with no subject on it at all.
//
// So: match on subject when the question has one. When it doesn't, fall back on
// the fact that there is nothing to confuse when a teacher has only recorded one
// class — which is 21 of the 23 teachers who have recordings. A teacher with
// several recorded subjects and a question that names none still gets nothing,
// because that is the case the guard exists for.
//
// Sessions with no classSubject are left out entirely: the digest's contract is
// to say which class and day a number came from, and an unlabelled recording
// cannot honour it.
export function selectDigestSessions(sessions: DigestSession[], subject: string | null): DigestSession[] {
  const labelled = sessions.filter((s) => s.classSubject != null)
  if (labelled.length === 0) return []
  if (subject) return labelled.filter((s) => sameSubject(s.classSubject, subject))
  const distinct = new Set(labelled.map((s) => s.classSubject!.trim().toLowerCase()))
  return distinct.size === 1 ? labelled : []
}

export async function loadDigestSessions(userId: string, subject: string | null): Promise<DigestSession[]> {
  const sessions = await prisma.audioSession.findMany({
    where: { userId, status: { in: ['analyzed', 'locked'] }, classSubject: { not: null } },
    orderBy: { sessionDate: 'desc' },
    take: 25,
    select: DIGEST_SELECT,
  })
  return selectDigestSessions(sessions, subject)
}

function roomLabel(s: DigestSession): string {
  const parts = [s.period, s.classSubject, s.gradeLevel ? `grade ${s.gradeLevel}` : null].filter(Boolean)
  const date = s.sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const room = parts.length ? parts.join(' ') : 'an unlabelled class'
  return `${room}, ${date}`
}

const TREND_COLUMNS: Record<string, { key: keyof DigestSession; label: string; unit: string }> = {
  talkRatio: { key: 'teacherTalkPct', label: 'their share of the talking', unit: '%' },
  higherOrderPct: { key: 'higherOrderPct', label: 'higher-order questions', unit: '%' },
  avgWaitTime: { key: 'avgWaitTimeSec', label: 'average wait time', unit: 's' },
  cfuCount: { key: 'cfuCount', label: 'spoken checks for understanding', unit: '' },
}

function trendLine(sessions: DigestSession[], focusMetric: string | null): string | null {
  const spec = focusMetric ? TREND_COLUMNS[focusMetric] : undefined
  if (!spec) return null
  // Oldest first, and only sessions that actually measured it.
  const values = sessions
    .slice()
    .reverse()
    .map((s) => s[spec.key])
    .filter((v): v is number => typeof v === 'number')
  if (values.length < 2) return null
  const window = values.slice(-TREND_SESSIONS)
  const first = window[0]
  const last = window[window.length - 1]
  const fmt = (n: number) => (spec.unit === 's' ? n.toFixed(1) : String(Math.round(n))) + spec.unit
  return `Across their last ${window.length} recordings in this subject, ${spec.label} went ${fmt(first)} → ${fmt(last)}.`
}

// Builds the block, or '' when there is nothing worth saying. Pure so the
// gating and the "not measured" wording can be tested without a database.
export function buildDigestBlock(
  sessions: DigestSession[],
  opts: { includeMetrics: boolean; focusMetric: string | null },
): string {
  const latest = sessions[0]
  if (!latest) return ''

  const lines: string[] = []
  if (opts.includeMetrics) {
    if (latest.teacherTalkPct != null) {
      const students = latest.studentTalkPct != null ? `, students ${Math.round(latest.studentTalkPct)}%` : ''
      lines.push(`- They talked ${Math.round(latest.teacherTalkPct)}% of the time${students}`)
    }
    if (latest.questionCount != null) {
      const ho = latest.higherOrderPct != null ? `, ${Math.round(latest.higherOrderPct)}% higher-order` : ''
      lines.push(`- ${latest.questionCount} questions${ho}`)
    }
    if (latest.avgWaitTimeSec != null) lines.push(`- Average wait time ${latest.avgWaitTimeSec.toFixed(1)}s`)
    if (latest.cfuCount != null) lines.push(`- ${latest.cfuCount} spoken checks for understanding`)
  }
  if (latest.classSummary) lines.push(`- What the lesson covered: ${latest.classSummary}`)
  if (latest.strengths) lines.push(`- A strength the report named: ${latest.strengths}`)
  if (latest.growthAreas) lines.push(`- What it flagged for attention: ${latest.growthAreas}`)
  if (latest.nextStep) lines.push(`- The next step it suggested: ${latest.nextStep}`)

  // Nothing but a room label is not worth the tokens or the risk.
  if (lines.length === 0) return ''

  const trend = opts.includeMetrics ? trendLine(sessions, opts.focusMetric) : null
  const duration = latest.durationSec != null ? ` (${Math.round(latest.durationSec / 60)} min recorded)` : ''

  return [
    '',
    '',
    "From this teacher's own class recording, measured rather than inferred. Use it only if what they are asking about genuinely connects to it — never open with it, never steer the conversation to it, and never state a number that is not written here. Say which class and day it came from when you use it.",
    '',
    `${roomLabel(latest)}${duration}:`,
    ...lines,
    ...(trend ? ['', trend] : []),
    '',
    "Only spoken audio was measured. Nothing here shows what students wrote, what was on a screen or board, or anything nonverbal, and a check or a response that does not appear was not necessarily absent — never tell the teacher they did not do something on this evidence.",
  ].join('\n')
}

// The most a teacher's digest can ever hold, for the "what Coach knows" screen:
// their most recently recorded subject with the numbers included. A real question
// gets this or less, never more, so showing the maximum is the honest thing to
// put in front of them. Deliberately NOT gated on consent — deciding whether to
// share something requires seeing it first.
export async function previewDigestFor(userId: string, focusMetric: string | null): Promise<string> {
  const latest = await prisma.audioSession.findFirst({
    where: { userId, status: { in: ['analyzed', 'locked'] } },
    orderBy: { sessionDate: 'desc' },
    select: { classSubject: true },
  })
  const sessions = await loadDigestSessions(userId, latest?.classSubject ?? null)
  return buildDigestBlock(sessions, { includeMetrics: true, focusMetric })
}

export async function buildDigestFor(opts: {
  userId: string
  email: string | null
  subject: string | null
  focusAreaValue: string | null
  focusMetric: string | null
  // This teacher's own consent (User.coachDigestEnabled). Both the rollout and
  // the consent have to allow it: the rollout controls who it is switched on
  // for, the consent controls whether they have said yes.
  enabled: boolean
}): Promise<string> {
  if (!opts.enabled || !digestAvailableFor(opts.email)) return ''
  const sessions = await loadDigestSessions(opts.userId, opts.subject)
  return buildDigestBlock(sessions, {
    includeMetrics: metricsAreRelevant(opts.focusAreaValue),
    focusMetric: opts.focusMetric,
  })
}
