import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAdmin, requireSuperadmin } from '../lib/auth.ts'
import { CHALLENGE_TYPES, MESSAGE_PURPOSES } from '../lib/communicationOptions.ts'
import { MIN_DURATION_FOR_CFU_DETECTION_SEC, PRIORITY_LABELS, topPriorityForSession } from '../lib/coachingPriority.ts'
import {
  generateUniqueJoinCode,
  normalizeJoinCode,
  parseAdminEmails,
  setListedAsAdmin,
  syncOrganizationRoles,
} from '../lib/organization.ts'
import { mergeBreakdownGroups } from '../lib/breakdownGroups.ts'
import { splitByCoverage } from '../lib/transcriptCoverage.ts'
import { prisma } from '../lib/prisma.ts'
import { ADMIN_PRIORITY_SELECT } from '../lib/schoolPriorities.ts'
import { draftGuidance, MAX_DRAFT_INPUT_CHARS } from '../lib/schoolPriorityDraft.ts'
import { checkGuidance, GUIDANCE_FIELDS, MAX_ACTIVE_PRIORITIES, type Guidance } from '../lib/schoolPriorityRules.ts'
import { staffQuestionMix } from '../lib/questionMix.ts'
import { OWN_SITUATION, SCENARIO_CATEGORIES } from '../lib/scenarioCategories.ts'
import { stripe } from '../lib/stripe.ts'

export const adminRouter = Router()

adminRouter.use(requireAdmin)

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKLY_TREND_WEEKS = 6

// A tally that also tracks how many *distinct* teachers contributed to each
// bucket, not just a raw occurrence count — the number that actually tells
// an admin whether something is broad enough across staff to justify a PD
// session, versus concentrated in a couple of teachers who'd benefit more
// from direct coaching. Every key is always present, even at zero, same
// convention as the plain tallies this replaces.
type TallyEntry = { count: number; teachers: number }

function createTally(keys: readonly string[]) {
  const map = new Map<string, { count: number; teacherIds: Set<string> }>(
    keys.map((k) => [k, { count: 0, teacherIds: new Set<string>() }]),
  )
  return {
    record(key: string, userId: string) {
      const entry = map.get(key) ?? { count: 0, teacherIds: new Set<string>() }
      entry.count += 1
      entry.teacherIds.add(userId)
      map.set(key, entry)
    },
    toJSON(): Record<string, TallyEntry> {
      return Object.fromEntries([...map.entries()].map(([k, v]) => [k, { count: v.count, teachers: v.teacherIds.size }]))
    },
  }
}

// Grade/subject breakdown (see /overview/breakdown below) — a bucket only
// ever renders numbers once at least this many *distinct teachers* have
// contributed a session to it. Below that, a narrow enough slice (e.g. one
// grade band in a small department) would start re-identifying a specific
// teacher even with no name shown, which breaks the "individual coaching
// stays private" promise in the Privacy Notice. This is the same "group
// comparisons need at least 5 teachers" floor used everywhere else (see
// dataConfidence below) — not yet configurable per org, since no district
// has enough volume yet to know what the right number would even be.
const MIN_TEACHERS_FOR_BREAKDOWN = 5

const GRADE_BANDS = ['K-2', '3-5', '6-8', '9-12', 'Unspecified'] as const
const SUBJECT_BUCKETS = ['Math', 'ELA', 'Science', 'Social Studies', 'Other'] as const

// gradeLevel/classSubject are free text a teacher types at session setup
// (see audioSessions.ts), not a fixed picker — so bucketing is a best-effort
// parse, not a lookup. Grade bands absorb typing variance ("6th grade",
// "Grade 6", "6") by just pulling the first digit out. Anything that
// doesn't parse lands in "Unspecified"/"Other" rather than being dropped,
// so every session is still represented somewhere.
function gradeBandFor(gradeLevel: string | null): (typeof GRADE_BANDS)[number] {
  if (!gradeLevel) return 'Unspecified'
  const normalized = gradeLevel.trim().toLowerCase()
  if (/\bk\b|kindergarten/.test(normalized)) return 'K-2'
  const match = normalized.match(/\d+/)
  if (!match) return 'Unspecified'
  const grade = parseInt(match[0], 10)
  if (grade <= 2) return 'K-2'
  if (grade <= 5) return '3-5'
  if (grade <= 8) return '6-8'
  if (grade <= 12) return '9-12'
  return 'Unspecified'
}

const CLASS_SUBJECT_KEYWORDS: Record<Exclude<(typeof SUBJECT_BUCKETS)[number], 'Other'>, string[]> = {
  Math: ['math', 'algebra', 'geometry', 'calculus'],
  ELA: ['ela', 'english', 'language arts', 'reading', 'writing', 'literacy'],
  Science: ['science', 'biology', 'chemistry', 'physics'],
  'Social Studies': ['social studies', 'history', 'geography', 'civics'],
}

function subjectBucketFor(classSubject: string | null): (typeof SUBJECT_BUCKETS)[number] {
  if (!classSubject) return 'Other'
  const normalized = classSubject.trim().toLowerCase()
  for (const [bucket, keywords] of Object.entries(CLASS_SUBJECT_KEYWORDS)) {
    if (keywords.some((k) => normalized.includes(k))) return bucket as (typeof SUBJECT_BUCKETS)[number]
  }
  return 'Other'
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

// Median instead of mean for the small set of "average X per session" stats
// (wait time, redirections/transitions/follow-ups per 10 min) — these are
// exactly the outlier-sensitive metrics where one unusually long or short
// session can swing a small-n average hard. The proportion-style rates
// elsewhere (higherOrderPct, cfuRatePct, etc.) are already a ratio computed
// across every session's raw counts, not a per-session average, so they
// don't have this problem and stay as-is.
function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// The single confidence rule applied to every stat on the Dashboard and
// Analytics pages: under 3 (sessions, or teachers for a group comparison)
// isn't shown as a number at all, 3-4 shows with a "Limited data" badge,
// 5+ shows with full confidence. Centralizing this in one place is what
// lets every stat use the same bar instead of the ad hoc >=5/>=10 checks
// that used to be scattered through the insight-builder functions below.
type DataConfidence = 'none' | 'limited' | 'full'
function dataConfidence(n: number): DataConfidence {
  if (n < 3) return 'none'
  if (n < 5) return 'limited'
  return 'full'
}

/// Matches MIN_WAIT_TIME_SAMPLES in web/src/lib/reportConfidence.ts — below
/// this many exchanges the average is a reading of one or two moments, which
/// no surface in this product treats as a habit.
const MIN_WAIT_TIME_SAMPLES = 3

type HeadlineMetricsRow = {
  teacherTalkPct: number | null
  questionCount: number | null
  avgWaitTimeSec: number | null
  durationSec: number | null
  metricsDetail: unknown
  questionLog: unknown
  teachingMoves: unknown
}

function metricsOf(s: HeadlineMetricsRow): Record<string, unknown> {
  return (s.metricsDetail ?? {}) as Record<string, unknown>
}
function numDetail(s: HeadlineMetricsRow, key: string): number | null {
  const v = metricsOf(s)[key]
  return typeof v === 'number' ? v : null
}

// The 5 headline instructional/climate metrics shown per grade/subject
// bucket — a curated subset of the full instructionalAverages/
// climateAverages computed below in /overview, using the exact same
// formulas so a bucket's numbers are directly comparable to the school-wide
// figure. Same evidence-only discipline: a session missing a field never
// counts as a zero for that field.
function computeHeadlineMetrics(sessions: HeadlineMetricsRow[]) {
  const waitTimes = sessions.map((s) => s.avgWaitTimeSec).filter((v): v is number => v != null)
  const waitTime2s = sessions
    .filter((s) => (numDetail(s, 'waitTime2SampleCount') ?? 0) >= MIN_WAIT_TIME_SAMPLES)
    .map((s) => numDetail(s, 'waitTime2Sec'))
    .filter((v): v is number => v != null)
  const paces = sessions.map((s) => numDetail(s, 'teacherWordsPerMinute')).filter((v): v is number => v != null)
  const teacherTalkPcts = sessions.map((s) => s.teacherTalkPct).filter((v): v is number => v != null)

  let higherOrderNumerator = 0
  let higherOrderDenominator = 0
  for (const s of sessions) {
    if (s.questionCount == null || s.questionCount <= 0) continue
    higherOrderNumerator += numDetail(s, 'higherOrderQuestionCount') ?? 0
    higherOrderDenominator += s.questionCount
  }

  const redirectionFrequencies: number[] = []
  let toneNumerator = 0
  let toneDenominator = 0
  for (const s of sessions) {
    const redirectionCount = numDetail(s, 'redirectionCount')
    if (redirectionCount != null && s.durationSec) {
      redirectionFrequencies.push(redirectionCount / (s.durationSec / 600))
    }
    const positiveCount = numDetail(s, 'positivePhraseCount')
    const correctiveCount = numDetail(s, 'correctivePhraseCount')
    if (positiveCount != null && correctiveCount != null && positiveCount + correctiveCount > 0) {
      toneNumerator += positiveCount
      toneDenominator += positiveCount + correctiveCount
    }
  }

  const questionMix = staffQuestionMix(sessions)

  return {
    avgWaitTimeSec: median(waitTimes),
    waitTimeSampleSize: waitTimes.length,
    waitTimeConfidence: dataConfidence(waitTimes.length),
    avgWaitTime2Sec: median(waitTime2s),
    waitTime2SampleSize: waitTime2s.length,
    waitTime2Confidence: dataConfidence(waitTime2s.length),
    avgTeacherPaceWpm: median(paces),
    paceSampleSize: paces.length,
    paceConfidence: dataConfidence(paces.length),
    avgTeacherTalkPct: average(teacherTalkPcts),
    talkSampleSize: teacherTalkPcts.length,
    talkConfidence: dataConfidence(teacherTalkPcts.length),
    higherOrderPct:
      higherOrderDenominator > 0 ? Math.round((higherOrderNumerator / higherOrderDenominator) * 100) : null,
    higherOrderSampleSize: higherOrderDenominator,
    higherOrderConfidence: dataConfidence(higherOrderDenominator),
    beyondRecallPct: questionMix.beyondRecallPct,
    questionMixQuestions: questionMix.questions,
    questionMixLessons: questionMix.lessons,
    questionMixConfidence: dataConfidence(questionMix.lessons),
    avgRedirectionPer10Min: median(redirectionFrequencies),
    redirectionFrequencySampleSize: redirectionFrequencies.length,
    redirectionConfidence: dataConfidence(redirectionFrequencies.length),
    positiveTonePct: toneDenominator > 0 ? Math.round((toneNumerator / toneDenominator) * 100) : null,
    toneSampleSize: toneDenominator,
    toneConfidence: dataConfidence(toneDenominator),
  }
}

// Shared by /overview and /members — resolves which organization (if any)
// the requester is allowed to see: an org_admin always sees their own,
// unset for everyone else unless a superadmin explicitly selects one via
// ?organizationId=. Never lets an org_admin view another org's data.
async function resolveScope(req: Request, res: Response) {
  const requester = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!requester) {
    res.status(401).json({ error: 'Not signed in' })
    return null
  }

  let organizationId: string | null = null
  let scope: 'platform' | 'organization' = 'platform'

  if (requester.role === 'org_admin') {
    organizationId = requester.organizationId
    scope = 'organization'
  } else if (requester.role === 'superadmin') {
    const requested = typeof req.query.organizationId === 'string' ? req.query.organizationId : null
    if (requested) {
      organizationId = requested
      scope = 'organization'
    }
  } else {
    res.status(403).json({ error: 'Admin access required' })
    return null
  }

  let organizationName: string | null = null
  if (scope === 'organization') {
    if (!organizationId) {
      res.status(400).json({ error: 'This account is not assigned to an organization yet.' })
      return null
    }
    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) {
      res.status(404).json({ error: 'Organization not found' })
      return null
    }
    organizationName = org.name
  }

  return { scope, organizationId, organizationName }
}

// Shared by /overview (via the inline call below) and the Professional
// Learning focus-area routes, which need to compute a single theme's
// *current* tally independently of a Dashboard page load. Always all-time/
// unfiltered when called for a focus area (a tracked theme follows its own
// lifetime, not whatever ad hoc date range is selected elsewhere on the
// Dashboard) — gradeBandFilter/subjectFilter are only ever passed by
// /overview itself.
async function computePriorityTally(
  organizationId: string | null,
  gradeBandFilter: string | null,
  subjectFilter: string | null,
): Promise<Record<string, TallyEntry>> {
  const relatedUserScope = organizationId ? { user: { organizationId } } : {}
  const sessions = await prisma.audioSession.findMany({
    where: { status: { in: ['analyzed', 'locked'] }, ...relatedUserScope },
    select: {
      userId: true,
      teacherTalkPct: true,
      studentTalkPct: true,
      questionCount: true,
      higherOrderPct: true,
      avgWaitTimeSec: true,
      cfuCount: true,
      durationSec: true,
      metricsDetail: true,
      gradeLevel: true,
      classSubject: true,
    },
  })
  const filtered = splitByCoverage(
    sessions.filter((s) => {
      if (gradeBandFilter && gradeBandFor(s.gradeLevel) !== gradeBandFilter) return false
      if (subjectFilter && subjectBucketFor(s.classSubject) !== subjectFilter) return false
      return true
    }),
  ).counted
  const tally = createTally(PRIORITY_LABELS)
  for (const s of filtered) {
    const top = topPriorityForSession(s)
    if (top) tally.record(top, s.userId)
  }
  return tally.toJSON()
}

// One theme's share of the lessons recorded in a window, for tracked focus
// areas. The all-time tally above can only grow, so comparing it before and
// after a focus area started made every one look like it was getting worse
// — even while teachers improved. A share of the lessons in each window
// answers the question the admin is actually asking: is this showing up in
// fewer lessons since we started working on it? Confidence is the number of
// lessons behind the share.
type ThemeWindowSnapshot = {
  count: number
  teachers: number
  sessions: number
  sharePct: number | null
  confidence: DataConfidence
  /// Lessons in the window left out because too little of them came through
  /// as speech. Not in `sessions`, and never part of the share.
  lowAudio: number
}

async function computeThemeWindow(
  organizationId: string,
  themeKey: string,
  from: Date | null,
  to: Date | null,
): Promise<ThemeWindowSnapshot> {
  const allSessions = await prisma.audioSession.findMany({
    where: {
      status: { in: ['analyzed', 'locked'] },
      user: { organizationId },
      sessionDate: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) },
    },
    select: {
      userId: true,
      teacherTalkPct: true,
      studentTalkPct: true,
      questionCount: true,
      higherOrderPct: true,
      avgWaitTimeSec: true,
      cfuCount: true,
      durationSec: true,
      metricsDetail: true,
    },
  })
  // A before/after comparison is where a change in recording habits would
  // most easily pass for a change in teaching, so neither window gets to rest
  // on lessons the microphone mostly missed.
  const { counted: sessions, lowAudio } = splitByCoverage(allSessions)
  const teacherIds = new Set<string>()
  let count = 0
  for (const s of sessions) {
    if (topPriorityForSession(s) !== themeKey) continue
    count += 1
    teacherIds.add(s.userId)
  }
  return {
    count,
    teachers: teacherIds.size,
    sessions: sessions.length,
    sharePct: sessions.length > 0 ? Math.round((count / sessions.length) * 100) : null,
    confidence: dataConfidence(sessions.length),
    lowAudio,
  }
}

// Aggregate, staff-wide numbers only — deliberately no route exists that
// returns one teacher's individual attempts, responses, or ratings. That's
// the whole point of the "aggregate trends only" admin visibility choice,
// unchanged whether the requester sees the whole platform or just their own
// organization. Factored out as a plain function (rather than living
// directly in the route handler) so /overview/export below can reuse the
// exact same computation and just serialize it differently — returns null
// once resolveScope has already written an error response.
async function computeOverview(req: Request, res: Response) {
  const resolved = await resolveScope(req, res)
  if (!resolved) return null
  const { scope, organizationId, organizationName } = resolved

  const userScope = organizationId ? { organizationId } : {}
  const relatedUserScope = organizationId ? { user: { organizationId } } : {}

  // The analysis window for the stat cards below — either an explicit
  // ?startDate=&endDate= range (a custom period an admin picked), or the
  // default week-navigator (?weekOffset=, 0 = the current week, 1 = the
  // week before, etc.) when no explicit range is given. Neither affects
  // the 6-week trend, which always shows the most recent 6 weeks ending
  // now. endDate is treated as inclusive (a date picker's "end date" means
  // through the end of that day), so it's pushed one day forward to make
  // an exclusive upper bound for the query.
  const startDateParam = typeof req.query.startDate === 'string' ? req.query.startDate : null
  const endDateParam = typeof req.query.endDate === 'string' ? req.query.endDate : null
  const parsedStart = startDateParam ? new Date(startDateParam) : null
  const parsedEnd = endDateParam ? new Date(endDateParam) : null
  const hasCustomRange =
    parsedStart != null && parsedEnd != null && !Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())

  let periodStart: Date
  let periodEnd: Date
  if (hasCustomRange) {
    periodStart = parsedStart!
    periodEnd = new Date(parsedEnd!.getTime() + DAY_MS)
  } else {
    const weekOffsetRaw = typeof req.query.weekOffset === 'string' ? parseInt(req.query.weekOffset, 10) : 0
    const weekOffset = Number.isFinite(weekOffsetRaw) && weekOffsetRaw >= 0 ? weekOffsetRaw : 0
    periodEnd = new Date(Date.now() - weekOffset * 7 * DAY_MS)
    periodStart = new Date(periodEnd.getTime() - 7 * DAY_MS)
  }
  const priorPeriodStart = new Date(periodStart.getTime() - (periodEnd.getTime() - periodStart.getTime()))

  // Grade band / subject filter — only ever narrows Lesson Debrief data
  // (instructionalAverages/climateAverages/priorityTally/contentNoteTally
  // below), since gradeLevel/classSubject only exist on AudioSession. Try
  // It Out, Communications, and Ask/Debrief have no grade/subject
  // dimension, so those tallies are always all-time/unfiltered regardless
  // of this param — there's no real relationship to filter them by.
  const gradeBandFilter = typeof req.query.gradeBand === 'string' ? req.query.gradeBand : null
  const subjectFilter = typeof req.query.subject === 'string' ? req.query.subject : null

  const totalTeachers = await prisma.user.count({ where: { role: 'teacher', ...userScope } })
  const activatedAccounts = await prisma.user.count({
    where: { role: 'teacher', onboardingCompletedAt: { not: null }, ...userScope },
  })

  const activitiesThisWeek = await prisma.usageLog.count({
    where: { createdAt: { gte: periodStart, lt: periodEnd }, ...relatedUserScope },
  })
  const activitiesPriorWeek = await prisma.usageLog.count({
    where: { createdAt: { gte: priorPeriodStart, lt: periodStart }, ...relatedUserScope },
  })

  const activeUserIds = await prisma.usageLog.findMany({
    where: { createdAt: { gte: periodStart, lt: periodEnd }, ...relatedUserScope },
    select: { userId: true },
    distinct: ['userId'],
  })

  // "Returning users" — active in this period AND the immediately
  // preceding period of equal length, i.e. showing up more than once, not
  // just a one-time spike in participation.
  const priorPeriodUserIds = await prisma.usageLog.findMany({
    where: { createdAt: { gte: priorPeriodStart, lt: periodStart }, ...relatedUserScope },
    select: { userId: true },
    distinct: ['userId'],
  })
  const priorPeriodUserIdSet = new Set(priorPeriodUserIds.map((r) => r.userId))
  const returningUsers = activeUserIds.filter((r) => priorPeriodUserIdSet.has(r.userId)).length

  // Category lives on the related Scenario, which Prisma can't group by
  // directly, so pull rows and tally by category in JS instead. All-time,
  // cumulative — not scoped to the selected week.
  const attempts = await prisma.scenarioAttempt.findMany({
    where: { ...relatedUserScope },
    include: { scenario: true },
  })
  // Two columns, not the whole row: this is a tally, and the rows it was
  // pulling carried every conversation's full transcript, for every teacher
  // in scope, to read `category` off each one. Nothing leaked (only the tally
  // is returned), but it is a school's worth of transcripts held in memory
  // for a count. The conversationPrep tally below has always done this
  // correctly.
  const debriefs = await prisma.debrief.findMany({
    where: { category: { not: null }, ...relatedUserScope },
    select: { category: true, userId: true },
  })

  // Every category is always present, even at zero — a category with no
  // tallied attempts is a confirmed zero (a complete count, not a sample),
  // never rendered as "unavailable" on the client.
  const categoryTally = createTally(SCENARIO_CATEGORIES)
  for (const a of attempts) {
    // A teacher's own situation the coach has not classified yet has no
    // category to count — it is not a seventh one.
    if (a.scenario.category === OWN_SITUATION) continue
    categoryTally.record(a.scenario.category, a.userId)
  }
  for (const d of debriefs) {
    if (!d.category) continue
    categoryTally.record(d.category, d.userId)
  }

  // Same aggregate-only tally, applied to Communications: what kind of hard
  // conversation teachers are practicing for, and what a written message is
  // about. Practice a Conversation's category is only set for source:
  // 'practice' rows (Review a Communication has no category at all).
  const conversationPreps = await prisma.conversationPrep.findMany({
    where: { source: 'practice', category: { not: null }, ...relatedUserScope },
    select: { category: true, userId: true },
  })
  const challengeTally = createTally(CHALLENGE_TYPES)
  for (const p of conversationPreps) {
    if (!p.category) continue
    challengeTally.record(p.category, p.userId)
  }

  const parentMessages = await prisma.parentMessage.findMany({
    where: { purpose: { not: null }, ...relatedUserScope },
    select: { purpose: true, userId: true },
  })
  const messagePurposeTally = createTally(MESSAGE_PURPOSES)
  for (const m of parentMessages) {
    if (!m.purpose) continue
    messagePurposeTally.record(m.purpose, m.userId)
  }

  // Lesson Debrief: which single coaching-priority theme each analyzed
  // session's own numbers point to, tallied the same way as the report
  // itself would rank it (see coachingPriority.ts) — never a session's
  // actual recording, transcript, or notes, only which of five fixed
  // themes its measured metrics land on.
  const audioSessions = await prisma.audioSession.findMany({
    where: { status: { in: ['analyzed', 'locked'] }, ...relatedUserScope },
    select: {
      userId: true,
      teacherTalkPct: true,
      studentTalkPct: true,
      questionCount: true,
      higherOrderPct: true,
      avgWaitTimeSec: true,
      cfuCount: true,
      durationSec: true,
      metricsDetail: true,
      questionLog: true,
      teachingMoves: true,
      lessonContent: true,
      contentNotes: true,
      gradeLevel: true,
      classSubject: true,
    },
  })

  // gradeBand/subject only ever narrow the metrics below — featureActivity/
  // featureAdoption above already used the full, unfiltered `audioSessions`.
  const inFilterAudioSessions = audioSessions.filter((s) => {
    if (gradeBandFilter && gradeBandFor(s.gradeLevel) !== gradeBandFilter) return false
    if (subjectFilter && subjectBucketFor(s.classSubject) !== subjectFilter) return false
    return true
  })
  // Every measured number below rests only on lessons where at least half the
  // recording came through as speech. The lost speech is mostly students', so
  // a patchy lesson would not just blur talk balance, it would tilt it toward
  // the teacher. The count of what was left out goes back with the numbers.
  const { counted: filteredAudioSessions, lowAudio: lowAudioLessons } = splitByCoverage(inFilterAudioSessions)
  const audioCoverage = {
    analyzedLessons: inFilterAudioSessions.length,
    countedLessons: filteredAudioSessions.length,
    lowAudioLessons,
  }

  const priorityTally = createTally(PRIORITY_LABELS)
  for (const s of filteredAudioSessions) {
    const top = topPriorityForSession(s)
    if (top) priorityTally.record(top, s.userId)
  }

  // All-time cumulative activity per feature area — same "not scoped to the
  // selected period" convention as the tallies above, for the Overview
  // tab's feature breakdown. Fetched as userId lists rather than plain
  // counts so the same query also powers Engagement's adoption-breadth
  // stat (how many distinct teachers have tried each feature at least
  // once) with no extra round trips.
  const [
    allPrepUsers,
    lessonPlanUsers,
    assignmentUsers,
    parentMessageUsers,
    conversationPlanUsers,
    debriefAllUsers,
  ] = await Promise.all([
      // source decides which product a row belongs to. One table, two features
      // since the rehearsal moved into Practice.
      prisma.conversationPrep.findMany({ where: relatedUserScope, select: { userId: true, source: true } }),
      // mode is Planning Coach's first three tabs: 'generated' = Build a
      // Lesson, 'feedback' = Improve a Lesson, 'presentation' = Review Slides.
      prisma.lessonPlan.findMany({ where: relatedUserScope, select: { userId: true, mode: true } }),
      // Review an Assignment is Planning Coach's fourth tab and writes its own
      // table. It was counted nowhere, so a teacher who only reviews
      // assignments read as never having opened Planning Coach at all.
      prisma.assignmentCoachSession.findMany({ where: relatedUserScope, select: { userId: true } }),
      prisma.parentMessage.findMany({ where: relatedUserScope, select: { userId: true } }),
      prisma.conversationPlan.findMany({ where: relatedUserScope, select: { userId: true } }),
      // Same story as conversationPrep: one table, two tools, told apart by
      // source. 'talk_to_me' is Talk It Through (app or Telegram); anything
      // else, including the null rows written before the column existed, is
      // Practice's ask flow.
      prisma.debrief.findMany({ where: relatedUserScope, select: { userId: true, source: true } }),
    ])
  // Rehearsing a conversation is Practice's, not Communication Coach's. Counting
  // every prep as Communications made this report overstate the tool these
  // numbers are most often used to judge, and understate the one it moved to.
  // Split on 'practice' rather than on 'review': the column has carried "real"
  // as well (see schema.prisma), so anything that is not a rehearsal stays
  // counted where it was counted before rather than vanishing from both totals.
  const rehearsalPreps = allPrepUsers.filter((p) => p.source === 'practice')
  const reviewPreps = allPrepUsers.filter((p) => p.source !== 'practice')

  // Talk It Through is its own tool, not a Practice rehearsal. It sits beside
  // Home in the nav now, and folding its conversations into Practice both
  // overstated the tool these numbers are used to judge and left the one a
  // principal is most often told to demo with no number at all. Split the same
  // way the rehearsal was split out of Communications above: on source, with
  // everything that is not a Talk It Through row staying where it was counted
  // before — null included, which the ask flow has always treated as its own.
  const talkDebriefs = debriefAllUsers.filter((d) => d.source === 'talk_to_me')
  const askDebriefs = debriefAllUsers.filter((d) => d.source !== 'talk_to_me')

  // Planning Coach is its four tabs, and one of them lives in another table.
  const planningRows = [...lessonPlanUsers, ...assignmentUsers]

  const featureActivity = {
    lessonDebrief: audioSessions.length,
    talkItThrough: talkDebriefs.length,
    lessonPlanning: planningRows.length,
    communications: reviewPreps.length + parentMessageUsers.length + conversationPlanUsers.length,
    practiceReflect: attempts.length + askDebriefs.length + rehearsalPreps.length,
  }

  const distinctTeacherCount = (rows: { userId: string }[]): number => new Set(rows.map((r) => r.userId)).size
  const featureAdoption = {
    lessonDebrief: distinctTeacherCount(audioSessions),
    talkItThrough: distinctTeacherCount(talkDebriefs),
    lessonPlanning: distinctTeacherCount(planningRows),
    communications: distinctTeacherCount([...reviewPreps, ...parentMessageUsers, ...conversationPlanUsers]),
    practiceReflect: distinctTeacherCount([...attempts, ...askDebriefs, ...rehearsalPreps]),
  }

  // Communication Coach is three separate tools wearing one number, which is no
  // use when the question is whether a particular one of them earns its place.
  // Same privacy rules as everything else here: counts and distinct teachers,
  // never a row.
  const communicationsByTool = {
    write: { activity: parentMessageUsers.length, teachers: distinctTeacherCount(parentMessageUsers) },
    prepare: { activity: conversationPlanUsers.length, teachers: distinctTeacherCount(conversationPlanUsers) },
    review: { activity: reviewPreps.length, teachers: distinctTeacherCount(reviewPreps) },
  }

  // Planning Coach's four tabs, counted apart for the same reason — "plans" as
  // one number cannot say whether slide review or assignment review is the
  // half that earns its place. Modes other than the three known ones (older
  // rows) fall into build, which is where they were drafted.
  const improvePlans = lessonPlanUsers.filter((p) => p.mode === 'feedback')
  const slidePlans = lessonPlanUsers.filter((p) => p.mode === 'presentation')
  const buildPlans = lessonPlanUsers.filter((p) => p.mode !== 'feedback' && p.mode !== 'presentation')
  const toolStat = (rows: { userId: string }[]) => ({ activity: rows.length, teachers: distinctTeacherCount(rows) })
  const planningByTool = {
    build: toolStat(buildPlans),
    improve: toolStat(improvePlans),
    slides: toolStat(slidePlans),
    assignment: toolStat(assignmentUsers),
  }

  // Staff-wide averages for the same underlying numbers each session's own
  // report already shows — rolled up instead of per-teacher. Every stat
  // only counts sessions with real evidence for it (a session missing a
  // field never counts as a zero) and reports its own sample size plus a
  // dataConfidence level, the same "never show a number with false
  // precision" discipline the report itself applies via reportConfidence.ts.
  // average/metricsOf/numDetail are the module-scope helpers defined above
  // (shared with computeHeadlineMetrics for the grade/subject breakdown).
  const waitTimes = filteredAudioSessions.map((s) => s.avgWaitTimeSec).filter((v): v is number => v != null)
  // The pause AFTER a student answers, alongside the one after a question.
  // Measured on real classroom audio it lands about three and a half times as
  // often as wait time 1, which needs a detected question AND an audible
  // answer where this needs only a student turn followed by a teacher turn —
  // so a staff-wide figure rests on far more sessions.
  const waitTime2s = filteredAudioSessions
    .filter((s) => (numDetail(s, 'waitTime2SampleCount') ?? 0) >= MIN_WAIT_TIME_SAMPLES)
    .map((s) => numDetail(s, 'waitTime2Sec'))
    .filter((v): v is number => v != null)
  // How fast staff speak. Exact arithmetic rather than a detection, so it is
  // available wherever there is a minute of teacher speech.
  const paces = filteredAudioSessions
    .map((s) => numDetail(s, 'teacherWordsPerMinute'))
    .filter((v): v is number => v != null)
  const teacherTalkPcts = filteredAudioSessions.map((s) => s.teacherTalkPct).filter((v): v is number => v != null)
  const studentTalkPcts = filteredAudioSessions.map((s) => s.studentTalkPct).filter((v): v is number => v != null)

  let higherOrderNumerator = 0
  let higherOrderDenominator = 0
  for (const s of filteredAudioSessions) {
    if (s.questionCount == null || s.questionCount <= 0) continue
    higherOrderNumerator += numDetail(s, 'higherOrderQuestionCount') ?? 0
    higherOrderDenominator += s.questionCount
  }

  const sessionsWithLessonContent = filteredAudioSessions.filter((s) => s.lessonContent != null)
  const sessionsWithConnections = sessionsWithLessonContent.filter((s) => {
    const lc = s.lessonContent as { connections?: unknown[] } | null
    return Array.isArray(lc?.connections) && lc.connections.length > 0
  })

  const followUpFrequencies: number[] = []
  for (const s of filteredAudioSessions) {
    if (!s.durationSec || s.durationSec <= 0) continue
    const count = numDetail(s, 'followUpQuestionCount')
    if (count == null) continue
    followUpFrequencies.push(count / (s.durationSec / 600))
  }

  const cfuEligible = filteredAudioSessions.filter((s) => (s.durationSec ?? 0) >= MIN_DURATION_FOR_CFU_DETECTION_SEC)
  const cfuSessionsWithCheck = cfuEligible.filter((s) => (s.cfuCount ?? 0) > 0)

  // What the questions asked of students, in the three kinds a teacher sees
  // on Questioning & Checking (lib/questionMix.ts), so "beyond recall" here
  // is the same arithmetic as the "X of Y" on each lesson. Confidence rests
  // on lessons rather than questions, since one lesson's questions lean
  // together.
  const questionMix = staffQuestionMix(filteredAudioSessions)

  const talkSampleSize = Math.min(teacherTalkPcts.length, studentTalkPcts.length)
  const instructionalAverages = {
    totalAnalyzedSessions: filteredAudioSessions.length,
    avgWaitTimeSec: median(waitTimes),
    waitTimeSampleSize: waitTimes.length,
    waitTimeConfidence: dataConfidence(waitTimes.length),
    avgWaitTime2Sec: median(waitTime2s),
    waitTime2SampleSize: waitTime2s.length,
    waitTime2Confidence: dataConfidence(waitTime2s.length),
    avgTeacherPaceWpm: median(paces),
    paceSampleSize: paces.length,
    paceConfidence: dataConfidence(paces.length),
    avgTeacherTalkPct: average(teacherTalkPcts),
    avgStudentTalkPct: average(studentTalkPcts),
    talkSampleSize,
    talkConfidence: dataConfidence(talkSampleSize),
    higherOrderPct:
      higherOrderDenominator > 0 ? Math.round((higherOrderNumerator / higherOrderDenominator) * 100) : null,
    higherOrderSampleSize: higherOrderDenominator,
    higherOrderConfidence: dataConfidence(higherOrderDenominator),
    realLifeConnectionRatePct:
      sessionsWithLessonContent.length > 0
        ? Math.round((sessionsWithConnections.length / sessionsWithLessonContent.length) * 100)
        : null,
    realLifeConnectionSampleSize: sessionsWithLessonContent.length,
    realLifeConnectionConfidence: dataConfidence(sessionsWithLessonContent.length),
    avgFollowUpPer10Min: median(followUpFrequencies),
    followUpSampleSize: followUpFrequencies.length,
    followUpConfidence: dataConfidence(followUpFrequencies.length),
    cfuRatePct: cfuEligible.length > 0 ? Math.round((cfuSessionsWithCheck.length / cfuEligible.length) * 100) : null,
    cfuSampleSize: cfuEligible.length,
    cfuConfidence: dataConfidence(cfuEligible.length),
    questionMix: questionMix.counts,
    beyondRecallPct: questionMix.beyondRecallPct,
    questionMixQuestions: questionMix.questions,
    questionMixLessons: questionMix.lessons,
    questionMixConfidence: dataConfidence(questionMix.lessons),
  }

  // Classroom climate and management — the same redirection/transition/
  // directive/tone signals the report's own Climate & Routines tab shows
  // per session, rolled up staff-wide. Same evidence-only discipline as
  // the instructional averages above: a session with no measured value
  // for a field never contributes to that field's average or rate.
  const redirectionFrequencies: number[] = []
  const redirectionMeasuredSessions: number[] = []
  const transitionFrequencies: number[] = []
  const directiveMeasuredSessions: number[] = []
  let toneNumerator = 0
  let toneDenominator = 0
  for (const s of filteredAudioSessions) {
    const redirectionCount = numDetail(s, 'redirectionCount')
    if (redirectionCount != null) {
      redirectionMeasuredSessions.push(redirectionCount)
      if (s.durationSec) redirectionFrequencies.push(redirectionCount / (s.durationSec / 600))
    }
    const transitionCount = numDetail(s, 'transitionCount')
    if (transitionCount != null && s.durationSec) {
      transitionFrequencies.push(transitionCount / (s.durationSec / 600))
    }
    const directiveCount = numDetail(s, 'directiveCount')
    if (directiveCount != null) directiveMeasuredSessions.push(directiveCount)

    const positiveCount = numDetail(s, 'positivePhraseCount')
    const correctiveCount = numDetail(s, 'correctivePhraseCount')
    if (positiveCount != null && correctiveCount != null && positiveCount + correctiveCount > 0) {
      toneNumerator += positiveCount
      toneDenominator += positiveCount + correctiveCount
    }
  }
  const climateAverages = {
    avgRedirectionPer10Min: median(redirectionFrequencies),
    redirectionFrequencySampleSize: redirectionFrequencies.length,
    redirectionConfidence: dataConfidence(redirectionFrequencies.length),
    zeroRedirectionRatePct:
      redirectionMeasuredSessions.length > 0
        ? Math.round(
            (redirectionMeasuredSessions.filter((c) => c === 0).length / redirectionMeasuredSessions.length) * 100,
          )
        : null,
    redirectionMeasuredSampleSize: redirectionMeasuredSessions.length,
    redirectionMeasuredConfidence: dataConfidence(redirectionMeasuredSessions.length),
    avgTransitionPer10Min: median(transitionFrequencies),
    transitionSampleSize: transitionFrequencies.length,
    transitionConfidence: dataConfidence(transitionFrequencies.length),
    clearDirectivesRatePct:
      directiveMeasuredSessions.length > 0
        ? Math.round((directiveMeasuredSessions.filter((c) => c > 0).length / directiveMeasuredSessions.length) * 100)
        : null,
    directiveSampleSize: directiveMeasuredSessions.length,
    directiveConfidence: dataConfidence(directiveMeasuredSessions.length),
    positiveTonePct: toneDenominator > 0 ? Math.round((toneNumerator / toneDenominator) * 100) : null,
    toneSampleSize: toneDenominator,
    toneConfidence: dataConfidence(toneDenominator),
  }

  // Content Specialist Notes: which theme (Clarity, Vocabulary, Engagement
  // with content, Worth double-checking) comes up most often across every
  // generated note — same aggregate-only, distinct-teacher-aware tally as
  // everything else here.
  const CONTENT_NOTE_LABELS = ['Clarity', 'Vocabulary', 'Engagement with content', 'Worth double-checking'] as const
  const contentNoteTally = createTally(CONTENT_NOTE_LABELS)
  for (const s of filteredAudioSessions) {
    const cn = s.contentNotes as { notes?: { label?: string }[] } | null
    if (!cn?.notes) continue
    for (const note of cn.notes) {
      if (!note.label) continue
      contentNoteTally.record(note.label, s.userId)
    }
  }

  // "Top 3 shared strengths" — the inverse of priorityTally (which surfaces
  // growth needs): each of these named thresholds is a metric performing
  // well enough, staff-wide, to be worth naming and reinforcing rather than
  // just flagging as a gap. Only a metric that clears both its threshold
  // AND the minimum-data rule counts as a candidate; the strongest 3 (by
  // how far over threshold, as a rough ranking) are returned.
  type StrengthCandidate = { label: string; value: number; confidence: DataConfidence }
  const strengthCandidates: StrengthCandidate[] = []
  if (instructionalAverages.cfuRatePct != null && instructionalAverages.cfuConfidence !== 'none' && instructionalAverages.cfuRatePct >= 70) {
    strengthCandidates.push({ label: 'Checks for understanding', value: instructionalAverages.cfuRatePct, confidence: instructionalAverages.cfuConfidence })
  }
  if (instructionalAverages.beyondRecallPct != null && instructionalAverages.questionMixConfidence !== 'none' && instructionalAverages.beyondRecallPct >= 40) {
    strengthCandidates.push({ label: 'Questions beyond recall', value: instructionalAverages.beyondRecallPct, confidence: instructionalAverages.questionMixConfidence })
  }
  if (instructionalAverages.realLifeConnectionRatePct != null && instructionalAverages.realLifeConnectionConfidence !== 'none' && instructionalAverages.realLifeConnectionRatePct >= 60) {
    strengthCandidates.push({ label: 'Real-life examples and connections', value: instructionalAverages.realLifeConnectionRatePct, confidence: instructionalAverages.realLifeConnectionConfidence })
  }
  if (climateAverages.zeroRedirectionRatePct != null && climateAverages.redirectionMeasuredConfidence !== 'none' && climateAverages.zeroRedirectionRatePct >= 70) {
    strengthCandidates.push({ label: 'Calm classroom management', value: climateAverages.zeroRedirectionRatePct, confidence: climateAverages.redirectionMeasuredConfidence })
  }
  if (climateAverages.clearDirectivesRatePct != null && climateAverages.directiveConfidence !== 'none' && climateAverages.clearDirectivesRatePct >= 80) {
    strengthCandidates.push({ label: 'Clear directions', value: climateAverages.clearDirectivesRatePct, confidence: climateAverages.directiveConfidence })
  }
  const strengths = strengthCandidates.sort((a, b) => b.value - a.value).slice(0, 3)

  const recentRated = attempts.filter((a) => a.rating != null && a.createdAt >= periodStart && a.createdAt < periodEnd)
  const priorRated = attempts.filter(
    (a) => a.rating != null && a.createdAt >= priorPeriodStart && a.createdAt < periodStart,
  )
  const strongCount = (rows: typeof attempts) => rows.filter((a) => (a.rating ?? 0) >= 4).length

  // Weekly activity trend — the 6 most recent weeks ending now, independent
  // of the navigator above. Every week always resolves to a real count
  // (possibly 0), since it's a complete tally of UsageLog rows, not a
  // sample — no "unavailable" state applies here.
  const weeklyActivity: { weekStart: string; activeCount: number }[] = []
  for (let i = WEEKLY_TREND_WEEKS - 1; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * DAY_MS)
    const start = new Date(end.getTime() - 7 * DAY_MS)
    const ids = await prisma.usageLog.findMany({
      where: { createdAt: { gte: start, lt: end }, ...relatedUserScope },
      select: { userId: true },
      distinct: ['userId'],
    })
    weeklyActivity.push({ weekStart: start.toISOString(), activeCount: ids.length })
  }

  return {
    scope,
    organizationName,
    totalTeachers,
    activatedAccounts,
    activeThisWeek: activeUserIds.length,
    returningUsers,
    activitiesThisWeek,
    activitiesPriorWeek,
    periodStart: periodStart.toISOString(),
    periodEnd: new Date(periodEnd.getTime() - 1).toISOString(),
    featureActivity,
    featureAdoption,
    communicationsByTool,
    planningByTool,
    categoryTally: categoryTally.toJSON(),
    challengeTally: challengeTally.toJSON(),
    messagePurposeTally: messagePurposeTally.toJSON(),
    priorityTally: priorityTally.toJSON(),
    strengths,
    instructionalAverages,
    climateAverages,
    audioCoverage,
    contentNoteTally: contentNoteTally.toJSON(),
    growth: {
      recentStrong: strongCount(recentRated),
      recentTotal: recentRated.length,
      priorStrong: strongCount(priorRated),
      priorTotal: priorRated.length,
    },
    weeklyActivity,
  }
}

adminRouter.get('/overview', async (req, res) => {
  const data = await computeOverview(req, res)
  if (!data) return
  res.json(data)
})

// CSV export of the same headline numbers shown on the Dashboard, for an
// admin to hand off to their own leadership — same query params/scoping as
// /overview, just a different serializer over the identical computation.
function csvEscape(value: string | number | null): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

adminRouter.get('/overview/export', async (req, res) => {
  const data = await computeOverview(req, res)
  if (!data) return

  const rows: [string, string | number | null][] = [
    ['Organization', data.organizationName ?? 'All organizations'],
    ['Period start', data.periodStart],
    ['Period end', data.periodEnd],
    ['Licensed staff', data.totalTeachers],
    ['Activated accounts', data.activatedAccounts],
    ['Active this period', data.activeThisWeek],
    ['Returning users', data.returningUsers],
    ['Coaching activities', data.activitiesThisWeek],
    ['Lessons analyzed', data.audioCoverage.analyzedLessons],
    ['Lessons the lesson numbers below are based on', data.audioCoverage.countedLessons],
    ['Lessons left out (too little clear audio)', data.audioCoverage.lowAudioLessons],
    ['Avg. wait time after a question (s)', data.instructionalAverages.avgWaitTimeSec],
    ['Avg. pause after a student answer (s)', data.instructionalAverages.avgWaitTime2Sec],
    ['Avg. teacher speaking pace (words a minute)', data.instructionalAverages.avgTeacherPaceWpm],
    ['Avg. teacher talk %', data.instructionalAverages.avgTeacherTalkPct],
    ['Higher-order questions %', data.instructionalAverages.higherOrderPct],
    ['Questions beyond recall %', data.instructionalAverages.beyondRecallPct],
    ['Recall questions', data.instructionalAverages.questionMix.recall],
    ['Explain questions', data.instructionalAverages.questionMix.explain],
    ['Reasoning questions', data.instructionalAverages.questionMix.reasoning],
    ['Checks for understanding rate %', data.instructionalAverages.cfuRatePct],
    ['Avg. redirections per 10 min', data.climateAverages.avgRedirectionPer10Min],
    ['Positive tone %', data.climateAverages.positiveTonePct],
  ]
  const csv = ['Metric,Value', ...rows.map(([label, value]) => `${csvEscape(label)},${csvEscape(value)}`)].join('\n')

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="wivoza-admin-overview.csv"')
  res.send(csv)
})

// Same 5 headline instructional/climate metrics as /overview, sliced by
// grade band or subject instead of rolled into one school-wide number — so
// an admin can see *where* to target PD, not just that PD is needed. Every
// bucket is suppressed below MIN_TEACHERS_FOR_BREAKDOWN distinct teachers;
// a suppressed bucket reports only that it's suppressed, never its actual
// (small, re-identifying) teacher count.
adminRouter.get('/overview/breakdown', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved

  const by = req.query.by === 'subject' ? 'subject' : 'gradeBand'
  const relatedUserScope = organizationId ? { user: { organizationId } } : {}

  const sessions = await prisma.audioSession.findMany({
    where: { status: { in: ['analyzed', 'locked'] }, ...relatedUserScope },
    select: {
      userId: true,
      teacherTalkPct: true,
      questionCount: true,
      avgWaitTimeSec: true,
      durationSec: true,
      metricsDetail: true,
      questionLog: true,
      teachingMoves: true,
      gradeLevel: true,
      classSubject: true,
    },
  })

  type Row = (typeof sessions)[number]
  const teachersIn = (rows: Row[]) => new Set(rows.map((r) => r.userId)).size
  const bucketKeys: readonly string[] = by === 'subject' ? SUBJECT_BUCKETS : GRADE_BANDS
  const bucketOf = (s: Row) => (by === 'subject' ? subjectBucketFor(s.classSubject) : gradeBandFor(s.gradeLevel))

  const grouped = new Map<string, Row[]>(bucketKeys.map((k) => [k, []]))
  // Same coverage bar as the school-wide numbers, applied before grouping so a
  // bucket's minimum-teacher check counts only the lessons it rests on.
  const { counted, lowAudio } = splitByCoverage(sessions)
  for (const s of counted) {
    grouped.get(bucketOf(s))!.push(s)
  }

  const groups = mergeBreakdownGroups(grouped, by, MIN_TEACHERS_FOR_BREAKDOWN)

  const breakdown = groups.map((g) => ({
    bucket: g.label,
    suppressed: false as const,
    teacherCount: teachersIn(g.rows),
    combined: g.combined && g.combined.length > 1 ? g.combined : undefined,
    metrics: computeHeadlineMetrics(g.rows),
  }))

  res.json({ by, minTeachers: MIN_TEACHERS_FOR_BREAKDOWN, breakdown, countedLessons: counted.length, lowAudioLessons: lowAudio })
})

// "Where teachers are focusing" — how many teachers picked each My Growth
// focus. Less identifying than instructional metrics (it's what someone
// chose to work on, not how they teach), so the floor is lower, but a focus
// only one teacher chose still folds into "other" rather than naming them.
const MIN_TEACHERS_FOR_FOCUS = 3
const MIN_TEACHERS_PER_FOCUS = 2

adminRouter.get('/overview/focus-areas', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved

  const users = await prisma.user.findMany({
    where: { focusMetric: { not: null }, suspendedAt: null, ...(organizationId ? { organizationId } : {}) },
    select: { focusMetric: true },
  })
  const counts = new Map<string, number>()
  for (const u of users) counts.set(u.focusMetric!, (counts.get(u.focusMetric!) ?? 0) + 1)

  if (users.length < MIN_TEACHERS_FOR_FOCUS) {
    res.json({ suppressed: true, minTeachers: MIN_TEACHERS_FOR_FOCUS })
    return
  }
  const areas = [...counts.entries()]
    .filter(([, count]) => count >= MIN_TEACHERS_PER_FOCUS)
    .sort((a, b) => b[1] - a[1])
    .map(([metric, count]) => ({ metric, count }))
  const otherCount = users.length - areas.reduce((sum, a) => sum + a.count, 0)
  res.json({ suppressed: false, minTeachers: MIN_TEACHERS_FOR_FOCUS, totalTeachers: users.length, areas, otherCount })
})

// Names/emails only — no attempts, ratings, or any practice content. Only
// visible when a concrete organization is in view (an org_admin's own org,
// or a superadmin's selected one) — never a platform-wide roster.
adminRouter.get('/members', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization to view its members.' })
    return
  }

  const members = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, jobTitle: true, role: true, suspendedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  // One grouped query for everyone's most recent activity, rather than a
  // separate query per member — account-level metadata (when did they last
  // use the app), not any coaching content, so it's consistent with what
  // this list already shows (join date, role, suspended status).
  const lastActive = await prisma.usageLog.groupBy({
    by: ['userId'],
    where: { userId: { in: members.map((m) => m.id) } },
    _max: { createdAt: true },
  })
  const lastActiveByUser = new Map(lastActive.map((row) => [row.userId, row._max.createdAt?.toISOString() ?? null]))

  res.json(members.map((m) => ({ ...m, lastActiveAt: lastActiveByUser.get(m.id) ?? null })))
})

// Un-enrolls a teacher from their org (org_admin's real, scoped power —
// no data is touched, they simply become independent again and could
// rejoin later with the join code). An org_admin can only reach members of
// their own org; a superadmin must have that org selected first — both
// enforced by comparing the target's organizationId against resolveScope's
// result, not just trusting the :id in the URL.
adminRouter.delete('/members/:id', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return
  }

  const targetId = req.params.id as string
  const target = await prisma.user.findUnique({ where: { id: targetId } })
  if (!target || target.organizationId !== organizationId) {
    res.status(404).json({ error: 'Member not found in this organization.' })
    return
  }

  // Off the school's admin list too — otherwise sign-in re-adopts a removed
  // school admin straight back into the school.
  await setListedAsAdmin(organizationId, target.email, false)
  await prisma.user.update({ where: { id: targetId }, data: { organizationId: null, role: 'teacher' } })
  res.json({ status: 'ok' })
})

// The same fixed list onboarding offers — an admin picks from it rather than
// typing, so rosters stay filterable.
const JOB_TITLES = ['Teacher', 'Instructional Coach', 'Assistant Principal', 'Principal', 'District Leader', 'Other']
const EDITABLE_ROLES = ['teacher', 'org_admin']

type UserEdits = { name?: string | null; jobTitle?: string | null; role?: string }

// Only the fields present in the body are changed. Email is deliberately
// not editable — it's how the person signs in, including through Google or
// Apple, and a typo would lock them out.
function parseUserEdits(body: unknown): { edits: UserEdits } | { error: string } {
  const { name, jobTitle, role } = (body ?? {}) as Record<string, unknown>
  const edits: UserEdits = {}
  if (name !== undefined) {
    if (name !== null && typeof name !== 'string') return { error: 'name must be a string or null' }
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (trimmed.length > 100) return { error: 'Name must be 100 characters or fewer.' }
    edits.name = trimmed || null
  }
  if (jobTitle !== undefined) {
    if (jobTitle !== null && (typeof jobTitle !== 'string' || !JOB_TITLES.includes(jobTitle))) {
      return { error: 'jobTitle must be one of the listed titles, or null' }
    }
    edits.jobTitle = jobTitle as string | null
  }
  if (role !== undefined) {
    if (typeof role !== 'string' || !EDITABLE_ROLES.includes(role)) {
      return { error: 'role must be teacher or org_admin' }
    }
    edits.role = role
  }
  return { edits }
}

// A school admin's edit and suspend reach only their own school's members,
// and never a superadmin — same organizationId check as removal above, so
// the :id in the URL is never trusted on its own. Permanent delete stays
// superadmin-only: it erases a teacher's private recordings and notes.
async function findScopedMember(req: Request, res: Response) {
  const resolved = await resolveScope(req, res)
  if (!resolved) return null
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return null
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id as string } })
  if (!target || target.organizationId !== organizationId || target.role === 'superadmin') {
    res.status(404).json({ error: 'Member not found in this organization.' })
    return null
  }
  return target
}

adminRouter.patch('/members/:id', async (req, res) => {
  const target = await findScopedMember(req, res)
  if (!target) return
  const parsed = parseUserEdits(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  if (parsed.edits.role !== undefined && parsed.edits.role !== target.role && target.id === req.user!.userId) {
    res.status(400).json({ error: "You can't change your own role." })
    return
  }
  if (parsed.edits.role !== undefined && parsed.edits.role !== target.role && target.organizationId) {
    await setListedAsAdmin(target.organizationId, target.email, parsed.edits.role === 'org_admin')
  }
  await prisma.user.update({ where: { id: target.id }, data: parsed.edits })
  res.json({ status: 'ok' })
})

adminRouter.post('/members/:id/suspend', async (req, res) => {
  const { suspended } = req.body ?? {}
  if (typeof suspended !== 'boolean') {
    res.status(400).json({ error: 'suspended must be a boolean' })
    return
  }
  const target = await findScopedMember(req, res)
  if (!target) return
  if (target.id === req.user!.userId) {
    res.status(400).json({ error: "You can't suspend your own account." })
    return
  }
  await prisma.user.update({ where: { id: target.id }, data: { suspendedAt: suspended ? new Date() : null } })
  res.json({ status: 'ok' })
})

// Everything below is superadmin-only — creating/editing/deleting
// organizations is a platform-operator action, not something a district's
// own org_admin should ever see or touch.

adminRouter.get('/organizations', requireSuperadmin, async (_req, res) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { users: true } } },
  })
  res.json(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      joinCode: o.joinCode,
      adminEmails: o.adminEmails,
      pilotEndsAt: o.pilotEndsAt,
      plan: o.plan,
      teacherCount: o._count.users,
    })),
  )
})

adminRouter.post('/organizations', requireSuperadmin, async (req, res) => {
  const { name, joinCode, adminEmails } = req.body ?? {}
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  let normalizedAdminEmails: string | null = null
  if (adminEmails !== undefined && adminEmails !== null && adminEmails !== '') {
    if (typeof adminEmails !== 'string') {
      res.status(400).json({ error: 'adminEmails must be a comma-separated string' })
      return
    }
    const parsed = parseAdminEmails(adminEmails)
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error })
      return
    }
    normalizedAdminEmails = parsed.emails.join(',')
  }

  let code: string
  if (typeof joinCode === 'string' && joinCode.trim()) {
    code = normalizeJoinCode(joinCode)
    const existing = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (existing) {
      res.status(409).json({ error: 'That join code is already in use.' })
      return
    }
  } else {
    code = await generateUniqueJoinCode()
  }

  const org = await prisma.organization.create({
    data: { name: name.trim(), joinCode: code, adminEmails: normalizedAdminEmails },
  })

  if (normalizedAdminEmails) {
    await syncOrganizationRoles(org.id, normalizedAdminEmails)
  }

  res.status(201).json({
    id: org.id,
    name: org.name,
    joinCode: org.joinCode,
    adminEmails: org.adminEmails,
    teacherCount: 0,
  })
})

adminRouter.patch('/organizations/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const { name, joinCode, adminEmails, pilotEndsOn } = req.body ?? {}

  const existing = await prisma.organization.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }

  const data: { name?: string; joinCode?: string; adminEmails?: string | null; pilotEndsAt?: Date | null } = {}

  // A free Wivoza+ pilot for every member until this day (YYYY-MM-DD),
  // through the end of it in US Eastern time — see plusAccessFor. Null ends
  // the pilot.
  if (pilotEndsOn !== undefined) {
    if (pilotEndsOn === null || pilotEndsOn === '') {
      data.pilotEndsAt = null
    } else if (typeof pilotEndsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pilotEndsOn)) {
      const endsAt = new Date(`${pilotEndsOn}T23:59:59-05:00`)
      if (Number.isNaN(endsAt.getTime())) {
        res.status(400).json({ error: 'pilotEndsOn must be a date like 2027-03-08' })
        return
      }
      data.pilotEndsAt = endsAt
    } else {
      res.status(400).json({ error: 'pilotEndsOn must be a date like 2027-03-08' })
      return
    }
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' })
      return
    }
    data.name = name.trim()
  }

  if (joinCode !== undefined) {
    if (typeof joinCode !== 'string' || !joinCode.trim()) {
      res.status(400).json({ error: 'joinCode must be a non-empty string' })
      return
    }
    const code = normalizeJoinCode(joinCode)
    const collision = await prisma.organization.findUnique({ where: { joinCode: code } })
    if (collision && collision.id !== id) {
      res.status(409).json({ error: 'That join code is already in use.' })
      return
    }
    data.joinCode = code
  }

  let normalizedAdminEmails: string | null | undefined
  if (adminEmails !== undefined) {
    if (adminEmails === null || adminEmails === '') {
      normalizedAdminEmails = null
    } else if (typeof adminEmails === 'string') {
      const parsed = parseAdminEmails(adminEmails)
      if ('error' in parsed) {
        res.status(400).json({ error: parsed.error })
        return
      }
      normalizedAdminEmails = parsed.emails.join(',')
    } else {
      res.status(400).json({ error: 'adminEmails must be a comma-separated string' })
      return
    }
    data.adminEmails = normalizedAdminEmails
  }

  const updated = await prisma.organization.update({ where: { id }, data })

  // A district swapping their point of contact takes effect immediately for
  // existing members, not just future signups.
  if (normalizedAdminEmails !== undefined) {
    await syncOrganizationRoles(id, normalizedAdminEmails)
  }

  const teacherCount = await prisma.user.count({ where: { organizationId: id } })
  res.json({
    id: updated.id,
    name: updated.name,
    joinCode: updated.joinCode,
    adminEmails: updated.adminEmails,
    pilotEndsAt: updated.pilotEndsAt,
    plan: updated.plan,
    teacherCount,
  })
})

// onDelete: SetNull on User.organizationId orphans former members back to
// independent teachers automatically — no manual cleanup needed here.
adminRouter.delete('/organizations/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const existing = await prisma.organization.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }
  await prisma.organization.delete({ where: { id } })
  res.json({ status: 'ok' })
})

// Deliberately manual, not automated per-teacher-count billing — real
// district deals are individually negotiated, so the superadmin computes
// the agreed amount (e.g. teacherCount * $200) themselves. Stripe's
// hosted invoice page natively accepts both ACH and card, so this is the
// only "district payment" flow needed — no separate checkout to build.
adminRouter.post('/organizations/:id/invoice', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const { amountCents, description } = req.body ?? {}
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: 'amountCents must be a positive integer' })
    return
  }
  if (typeof description !== 'string' || !description.trim()) {
    res.status(400).json({ error: 'description is required' })
    return
  }

  const organization = await prisma.organization.findUnique({ where: { id } })
  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }
  const billingEmail = (organization.adminEmails ?? '').split(',').map((e) => e.trim()).filter(Boolean)[0]
  if (!billingEmail) {
    res.status(400).json({ error: 'This organization has no admin email on file to send the invoice to.' })
    return
  }

  try {
    let customerId = organization.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({ name: organization.name, email: billingEmail })
      customerId = customer.id
      await prisma.organization.update({ where: { id }, data: { stripeCustomerId: customerId } })
    }

    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: 30,
      auto_advance: true,
    })
    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: amountCents,
      currency: 'usd',
      description: description.trim(),
    })
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id!)
    await stripe.invoices.sendInvoice(invoice.id!)

    res.json({ invoiceUrl: finalized.hosted_invoice_url })
  } catch (error) {
    console.error('[admin] district invoice creation failed:', error)
    res.status(502).json({ error: 'Could not create the invoice. Please try again.' })
  }
})

// Whole-building free pilot — deliberately uncapped teacher count (more
// reach than a small capped subset) and superadmin-activated after a
// sales conversation, matching the existing "ask for a quote" model. No
// self-serve district signup.
adminRouter.post('/organizations/:id/start-pilot', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const organization = await prisma.organization.findUnique({ where: { id } })
  if (!organization) {
    res.status(404).json({ error: 'Organization not found' })
    return
  }
  const pilotEndsAt = new Date()
  pilotEndsAt.setMonth(pilotEndsAt.getMonth() + 4, pilotEndsAt.getDate() + 15) // ~one semester
  const updated = await prisma.organization.update({ where: { id }, data: { pilotEndsAt } })
  res.json(updated)
})

// A coaching-priority theme an admin has explicitly chosen to track over
// time — the "Professional Learning" persistence feature. Active rows get
// a live-recomputed currentSnapshot on every list fetch; archived rows are
// returned as-is (their story is already finished, no further recompute).
adminRouter.get('/pd-focus-areas', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.json({ items: [], themeCounts: {} })
    return
  }

  const rows = await prisma.pdFocusArea.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } })

  // Always computed (not just for active themes) so the client can show
  // real current counts for every theme in "+ Track a new focus area",
  // including ones with no tracked row yet — always all-time/unfiltered,
  // independent of whatever ad hoc date range is selected on the Dashboard.
  const themeCounts = await computePriorityTally(organizationId, null, null)

  const items = await Promise.all(
    rows.map(async (row) => {
      if (row.status !== 'active') {
        return { ...row, currentSnapshot: null }
      }
      // The baseline was frozen under whatever rules held on the day it was
      // taken, and "since" is recomputed under today's. Its window is closed,
      // so recomputing it is the same lessons read the same way as "since" —
      // otherwise the coverage bar would apply to one side of the comparison
      // and pass a change in the rules off as a change in the school. Kept
      // frozen for rows from before shares were tracked, which the client
      // still shows as raw counts.
      const stored = row.baselineSnapshot as { sessions?: number; capturedAt?: string } | null
      const baselineSnapshot =
        stored?.sessions != null
          ? { ...(await computeThemeWindow(organizationId, row.themeKey, null, row.createdAt)), capturedAt: stored.capturedAt }
          : row.baselineSnapshot
      return {
        ...row,
        baselineSnapshot,
        currentSnapshot: await computeThemeWindow(organizationId, row.themeKey, row.createdAt, null),
      }
    }),
  )

  res.json({ items, themeCounts })
})

// Creates a tracked focus area with its baseline snapshot frozen at the
// current live tally for this theme. title/suggestedAction are sent by the
// client (already resolved from its own PRIORITY_LABELS/PD_SUGGESTIONS
// maps) so the server never needs its own copy of that display text.
adminRouter.post('/pd-focus-areas', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return
  }

  const { themeKey, title, suggestedAction } = req.body ?? {}
  if (typeof themeKey !== 'string' || !PRIORITY_LABELS.includes(themeKey as (typeof PRIORITY_LABELS)[number])) {
    res.status(400).json({ error: 'themeKey must be one of the recognized coaching-priority themes.' })
    return
  }
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title is required.' })
    return
  }

  const existingActive = await prisma.pdFocusArea.findFirst({ where: { organizationId, themeKey, status: 'active' } })
  if (existingActive) {
    res.status(409).json({ error: 'This theme is already being tracked as an active focus area.' })
    return
  }

  const startedAt = new Date()
  const baseline = await computeThemeWindow(organizationId, themeKey, null, startedAt)

  const created = await prisma.pdFocusArea.create({
    data: {
      organizationId,
      createdByUserId: req.user!.userId,
      themeKey,
      title: title.trim(),
      suggestedAction: typeof suggestedAction === 'string' && suggestedAction.trim() ? suggestedAction.trim() : null,
      baselineSnapshot: { ...baseline, capturedAt: startedAt.toISOString() },
      createdAt: startedAt,
    },
  })

  res.json({
    ...created,
    currentSnapshot: await computeThemeWindow(organizationId, themeKey, startedAt, null),
  })
})

// The only mutation this pass needs — archiving a focus area. Ownership-
// scoped via organizationId matching the resolved scope, same pattern as
// /members/:id above.
adminRouter.patch('/pd-focus-areas/:id', async (req, res) => {
  const resolved = await resolveScope(req, res)
  if (!resolved) return
  const { organizationId } = resolved
  if (!organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return
  }

  const { status } = req.body ?? {}
  if (status !== 'archived') {
    res.status(400).json({ error: "status must be 'archived'." })
    return
  }

  const existing = await prisma.pdFocusArea.findUnique({ where: { id: req.params.id as string } })
  if (!existing || existing.organizationId !== organizationId) {
    res.status(404).json({ error: 'Focus area not found in this organization.' })
    return
  }

  const archivedAt = new Date()
  const final = await computeThemeWindow(organizationId, existing.themeKey, existing.createdAt, archivedAt)
  const finalSnapshot = { ...final, capturedAt: archivedAt.toISOString() }

  const updated = await prisma.pdFocusArea.update({
    where: { id: existing.id },
    data: { status: 'archived', archivedAt, finalSnapshot },
  })
  res.json({ ...updated, currentSnapshot: null })
})

// Coaching Priorities (docs/coaching-priorities.md). Every read here goes
// through ADMIN_PRIORITY_SELECT, and nothing in this file reads a teacher's
// choice: an admin sees the guidance as teachers see it, and never who chose
// it, paused it, or said no. A privacy test holds this file to that.

async function priorityScope(req: Request, res: Response): Promise<string | null> {
  const resolved = await resolveScope(req, res)
  if (!resolved) return null
  if (!resolved.organizationId) {
    res.status(400).json({ error: 'Select an organization first.' })
    return null
  }
  return resolved.organizationId
}

/// 'YYYY-MM-DD' → a date; '' or null → none; anything else → undefined (invalid).
function parseDay(value: unknown): Date | null | undefined {
  if (value === null || value === '' || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const d = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? undefined : d
}

async function staffNames(organizationId: string): Promise<(string | null)[]> {
  const users = await prisma.user.findMany({ where: { organizationId }, select: { name: true } })
  return users.map((u) => u.name)
}

function guidanceInput(body: Record<string, unknown>): Partial<Record<keyof Guidance, unknown>> {
  const out: Partial<Record<keyof Guidance, unknown>> = {}
  for (const field of GUIDANCE_FIELDS) out[field] = body[field]
  return out
}

adminRouter.get('/coaching-priorities', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const items = await prisma.schoolPriority.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: ADMIN_PRIORITY_SELECT,
  })
  res.json({ items, maxActive: MAX_ACTIVE_PRIORITIES })
})

// "Help me write this". Returns a draft for the admin to edit; saves nothing.
adminRouter.post('/coaching-priorities/draft', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) {
    res.status(400).json({ error: 'Write a few sentences about what your school is working on.' })
    return
  }
  if (text.length > MAX_DRAFT_INPUT_CHARS) {
    res.status(400).json({ error: `Keep it under ${MAX_DRAFT_INPUT_CHARS} characters.` })
    return
  }
  const draft = await draftGuidance(text)
  if (!draft) {
    res.status(502).json({ error: "Couldn't draft it just now. Try again, or fill in the fields yourself." })
    return
  }
  const check = checkGuidance(draft, await staffNames(organizationId))
  res.json({ draft, warning: check.ok ? null : check.error })
})

adminRouter.post('/coaching-priorities', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const body = (req.body ?? {}) as Record<string, unknown>
  const check = checkGuidance(guidanceInput(body), await staffNames(organizationId))
  if (!check.ok) {
    res.status(400).json({ error: check.error, field: check.field })
    return
  }
  const startsOn = parseDay(body.startsOn)
  const endsOn = parseDay(body.endsOn)
  if (startsOn === undefined || endsOn === undefined || (startsOn && endsOn && endsOn < startsOn)) {
    res.status(400).json({ error: 'Check the dates: the end has to be on or after the start.' })
    return
  }
  const open = await prisma.schoolPriority.count({ where: { organizationId, status: { not: 'archived' } } })
  if (open >= MAX_ACTIVE_PRIORITIES) {
    res.status(409).json({ error: `A school can have ${MAX_ACTIVE_PRIORITIES} priorities at a time. Archive one first.` })
    return
  }
  const created = await prisma.schoolPriority.create({
    data: { organizationId, createdByUserId: req.user!.userId, ...check.guidance, startsOn, endsOn },
    select: ADMIN_PRIORITY_SELECT,
  })
  res.json(created)
})

// Editing. A draft just changes. A shared priority needs the admin to say
// which kind of edit it is: wording only applies as it is, while a change to
// what it means asks every teacher again (their earlier answer no longer
// counts, because it was an answer to something else).
adminRouter.patch('/coaching-priorities/:id', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const existing = await prisma.schoolPriority.findFirst({
    where: { id: req.params.id as string, organizationId },
    select: ADMIN_PRIORITY_SELECT,
  })
  if (!existing || existing.status === 'archived') {
    res.status(404).json({ error: 'Priority not found.' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = {}
  for (const field of GUIDANCE_FIELDS) merged[field] = body[field] !== undefined ? body[field] : existing[field]
  const check = checkGuidance(merged, await staffNames(organizationId))
  if (!check.ok) {
    res.status(400).json({ error: check.error, field: check.field })
    return
  }
  const startsOn = body.startsOn !== undefined ? parseDay(body.startsOn) : existing.startsOn
  const endsOn = body.endsOn !== undefined ? parseDay(body.endsOn) : existing.endsOn
  if (startsOn === undefined || endsOn === undefined || (startsOn && endsOn && endsOn < startsOn)) {
    res.status(400).json({ error: 'Check the dates: the end has to be on or after the start.' })
    return
  }

  let versionData: { version?: number; changeNote?: string | null } = {}
  if (existing.status === 'active') {
    const change = body.change
    if (change !== 'wording' && change !== 'meaning') {
      res.status(400).json({ error: "Say whether this edit is wording only or changes what it means." })
      return
    }
    if (change === 'meaning') {
      const note = typeof body.changeNote === 'string' ? body.changeNote.trim() : ''
      if (!note || note.length > 300) {
        res.status(400).json({ error: 'Add a short note (under 300 characters) telling teachers what changed.' })
        return
      }
      versionData = { version: existing.version + 1, changeNote: note }
    }
  }

  const updated = await prisma.schoolPriority.update({
    where: { id: existing.id },
    data: { ...check.guidance, startsOn, endsOn, ...versionData },
    select: ADMIN_PRIORITY_SELECT,
  })
  res.json(updated)
})

adminRouter.post('/coaching-priorities/:id/publish', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const existing = await prisma.schoolPriority.findFirst({
    where: { id: req.params.id as string, organizationId, status: 'draft' },
    select: ADMIN_PRIORITY_SELECT,
  })
  if (!existing) {
    res.status(404).json({ error: 'No draft to share.' })
    return
  }
  const check = checkGuidance(existing, await staffNames(organizationId))
  if (!check.ok) {
    res.status(400).json({ error: check.error, field: check.field })
    return
  }
  const updated = await prisma.schoolPriority.update({
    where: { id: existing.id },
    data: { status: 'active', publishedAt: new Date() },
    select: ADMIN_PRIORITY_SELECT,
  })
  res.json(updated)
})

// Archiving stops it everywhere from now on, for every teacher; past lessons
// and conversations stay as they were.
adminRouter.post('/coaching-priorities/:id/archive', async (req, res) => {
  const organizationId = await priorityScope(req, res)
  if (!organizationId) return
  const existing = await prisma.schoolPriority.findFirst({
    where: { id: req.params.id as string, organizationId, status: { not: 'archived' } },
    select: { id: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Priority not found.' })
    return
  }
  const updated = await prisma.schoolPriority.update({
    where: { id: existing.id },
    data: { status: 'archived' },
    select: ADMIN_PRIORITY_SELECT,
  })
  res.json(updated)
})

// Platform-wide roster — the one place a superadmin can find any account,
// including an independent teacher who isn't in any org and so never shows
// up in a /members list. /members deliberately never allows this
// unscoped view for anyone else.
adminRouter.get('/users', requireSuperadmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      organizationId: true,
      suspendedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      jobTitle: u.jobTitle,
      organizationId: u.organizationId,
      organizationName: u.organization?.name ?? null,
      suspendedAt: u.suspendedAt,
      createdAt: u.createdAt,
    })),
  )
})

adminRouter.post('/users/:id/suspend', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const { suspended } = req.body ?? {}
  if (typeof suspended !== 'boolean') {
    res.status(400).json({ error: 'suspended must be a boolean' })
    return
  }
  if (id === req.user!.userId) {
    res.status(400).json({ error: "You can't suspend your own account." })
    return
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { suspendedAt: suspended ? new Date() : null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      suspendedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
  })
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    organizationName: updated.organization?.name ?? null,
    suspendedAt: updated.suspendedAt,
    createdAt: updated.createdAt,
  })
})

// The platform-wide edit: everything a school admin can change, plus which
// school the user belongs to. A school admin can't exist without a school,
// so moving one out of every school also makes them a teacher.
adminRouter.patch('/users/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  const parsed = parseUserEdits(req.body)
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error })
    return
  }
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  const data: UserEdits & { organizationId?: string | null } = { ...parsed.edits }
  const { organizationId } = (req.body ?? {}) as { organizationId?: unknown }
  if (organizationId !== undefined) {
    if (organizationId !== null && typeof organizationId !== 'string') {
      res.status(400).json({ error: 'organizationId must be a string or null' })
      return
    }
    if (organizationId && !(await prisma.organization.findUnique({ where: { id: organizationId } }))) {
      res.status(400).json({ error: 'That organization no longer exists.' })
      return
    }
    data.organizationId = organizationId || null
  }

  if (target.role === 'superadmin' && (data.role !== undefined || data.organizationId !== undefined)) {
    res.status(400).json({ error: "A superadmin's role and school can't be changed here." })
    return
  }
  const finalOrg = data.organizationId !== undefined ? data.organizationId : target.organizationId
  let finalRole = data.role ?? target.role
  if (finalRole === 'org_admin' && !finalOrg) {
    data.role = 'teacher'
    finalRole = 'teacher'
  }

  // Keep every school's admin list in step, or sign-in would undo this: an
  // old school still listing them would pull them back in as its admin.
  if (target.role !== 'superadmin') {
    if (target.organizationId && target.organizationId !== finalOrg) {
      await setListedAsAdmin(target.organizationId, target.email, false)
    }
    if (finalOrg) await setListedAsAdmin(finalOrg, target.email, finalRole === 'org_admin')
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      organizationId: true,
      suspendedAt: true,
      createdAt: true,
      organization: { select: { name: true } },
    },
  })
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    jobTitle: updated.jobTitle,
    organizationId: updated.organizationId,
    organizationName: updated.organization?.name ?? null,
    suspendedAt: updated.suspendedAt,
    createdAt: updated.createdAt,
  })
})

// Cascades to every model owned by this user (ScenarioAttempt, Debrief,
// ParentMessage, UsageLog, AudioSession -> TranscriptSegment, LessonPlan,
// ConversationPrep, ConversationPlan) — all already onDelete: Cascade in
// the schema, so this one call cleanly removes everything.
adminRouter.delete('/users/:id', requireSuperadmin, async (req, res) => {
  const id = req.params.id as string
  if (id === req.user!.userId) {
    res.status(400).json({ error: "You can't delete your own account." })
    return
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  await prisma.user.delete({ where: { id } })
  res.json({ status: 'ok' })
})
