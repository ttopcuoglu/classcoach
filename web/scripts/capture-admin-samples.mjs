// Regenerates the For Schools marketing samples from the real admin pages:
//   public/samples/pilot-report.pdf     the printed pilot report, sample mode
//   public/samples/pilot-report.png     its first page
//   public/samples/admin-dashboard.png  At a glance + What needs your attention
//   public/samples/admin-pd-progress.png  a tracked Professional Learning focus area
//
//   npm run dev                                   (in another terminal)
//   node scripts/capture-admin-samples.mjs
//
// Headless Chrome renders the actual app, so the samples always match the
// product. The page never talks to a server: every /api call is answered
// with the invented Maple Ridge Academy numbers below — the same story the
// demo principal account tells — before the app's own code loads.

import { withChrome } from './capture.mjs'

// ---- invented school ----

const T = (count, teachers) => ({ count, teachers })
const M = (talk, wait, ho) => ({
  avgWaitTimeSec: wait, waitTimeSampleSize: 20, waitTimeConfidence: 'full',
  avgTeacherTalkPct: talk, talkSampleSize: 20, talkConfidence: 'full',
  higherOrderPct: ho, higherOrderSampleSize: 300, higherOrderConfidence: 'full',
  avgRedirectionPer10Min: 1, redirectionFrequencySampleSize: 20, redirectionConfidence: 'full',
  positiveTonePct: 80, toneSampleSize: 100, toneConfidence: 'full',
})
const FIXTURES = {
  '/api/auth/me': {
    id: 'p1', email: 'principal@mapleridge.example', name: 'Principal', role: 'org_admin', organizationId: 'o1',
    organization: { id: 'o1', name: 'Maple Ridge Academy' }, onboardingCompletedAt: '2026-08-10T00:00:00Z',
    termsAcceptedAt: '2026-08-10T00:00:00Z', plusAccess: 'school', coachMemoryEnabled: true,
  },
  '/api/admin/overview': {
    scope: 'organization', organizationName: 'Maple Ridge Academy', totalTeachers: 24, activatedAccounts: 21,
    activeThisWeek: 17, returningUsers: 13, activitiesThisWeek: 64, activitiesPriorWeek: 51,
    periodStart: '2026-09-12T00:00:00Z', periodEnd: '2026-09-18T00:00:00Z',
    featureActivity: { lessonDebrief: 76, lessonPlanning: 22, communications: 30, practiceReflect: 70 },
    featureAdoption: { lessonDebrief: 21, lessonPlanning: 12, communications: 18, practiceReflect: 19 },
    categoryTally: { transitions: T(22, 12), disruption: T(17, 8), defiance: T(10, 8), disengagement: T(8, 5), peer_conflict: T(4, 3), technology_misuse: T(3, 3) },
    challengeTally: { behavior_concern: T(4, 3), angry_accusatory: T(3, 3), grade_dispute: T(2, 2) },
    messagePurposeTally: { behavior_concern: T(8, 6), academic_concern: T(6, 6), positive_update: T(5, 5), attendance_concern: T(2, 2) },
    strengths: [
      { label: 'Clear directions', value: 100, confidence: 'full' },
      { label: 'Checks for understanding', value: 99, confidence: 'full' },
      { label: 'Real-life examples and connections', value: 66, confidence: 'full' },
    ],
    priorityTally: { 'talk-balance': T(23, 14), questioning: T(20, 9), 'wait-time': T(11, 8), cfu: T(0, 0), feedback: T(2, 2) },
    instructionalAverages: {
      totalAnalyzedSessions: 76, avgWaitTimeSec: 2.7, waitTimeSampleSize: 74, waitTimeConfidence: 'full',
      avgTeacherTalkPct: 59, avgStudentTalkPct: 14, talkSampleSize: 76, talkConfidence: 'full',
      higherOrderPct: 48, higherOrderSampleSize: 1040, higherOrderConfidence: 'full',
      realLifeConnectionRatePct: 66, realLifeConnectionSampleSize: 76, realLifeConnectionConfidence: 'full',
      avgFollowUpPer10Min: 1.4, followUpSampleSize: 76, followUpConfidence: 'full',
      cfuRatePct: 99, cfuSampleSize: 76, cfuConfidence: 'full',
    },
    climateAverages: {
      avgRedirectionPer10Min: 0.6, redirectionFrequencySampleSize: 76, redirectionConfidence: 'full',
      zeroRedirectionRatePct: 30, redirectionMeasuredSampleSize: 76, redirectionMeasuredConfidence: 'full',
      avgTransitionPer10Min: 0.3, transitionSampleSize: 76, transitionConfidence: 'full',
      clearDirectivesRatePct: 100, directiveSampleSize: 76, directiveConfidence: 'full',
      positiveTonePct: 82, toneSampleSize: 410, toneConfidence: 'full',
    },
    contentNoteTally: { Clarity: T(18, 9), Vocabulary: T(8, 6), 'Engagement with content': T(7, 5), 'Worth double-checking': T(2, 2) },
    growth: { recentStrong: 6, recentTotal: 9, priorStrong: 1, priorTotal: 3 },
    weeklyActivity: [3, 8, 11, 13, 15, 17].map((c, i) => ({ weekStart: new Date(Date.UTC(2026, 7, 8 + i * 7)).toISOString(), activeCount: c })),
  },
  '/api/admin/overview/focus-areas': {
    suppressed: false, minTeachers: 3, totalTeachers: 18, otherCount: 0,
    areas: [{ metric: 'talkRatio', count: 7 }, { metric: 'higherOrderPct', count: 4 }, { metric: 'avgWaitTime', count: 3 }, { metric: 'cfuCount', count: 2 }, { metric: 'redirectionCount', count: 2 }],
  },
  '/api/admin/pd-focus-areas': {
    items: [{
      id: 'f1', organizationId: 'o1', createdByUserId: 'p1', themeKey: 'talk-balance', title: 'Talk time balance',
      suggestedAction: 'a short PD session on structuring more student talk time — think-pair-share, cold-call routines',
      status: 'active', createdAt: '2026-09-01T11:30:00Z', archivedAt: null, finalSnapshot: null,
      baselineSnapshot: { count: 13, teachers: 9, sessions: 30, sharePct: 43, confidence: 'full', capturedAt: '2026-09-01T11:30:00Z' },
      currentSnapshot: { count: 10, teachers: 8, sessions: 46, sharePct: 22, confidence: 'full' },
    }],
    themeCounts: { 'talk-balance': T(23, 14), questioning: T(20, 9), 'wait-time': T(11, 8), cfu: T(0, 0), feedback: T(2, 2) },
  },
  'breakdown:gradeBand': { by: 'gradeBand', minTeachers: 5, breakdown: [
    { bucket: 'Grades 6-8', suppressed: false, teacherCount: 11, metrics: M(61, 2.6, 49) },
    { bucket: 'Grades 9-12', suppressed: false, teacherCount: 10, metrics: M(57, 2.8, 47) },
  ] },
  'breakdown:subject': { by: 'subject', minTeachers: 5, breakdown: [
    { bucket: 'STEM', suppressed: false, teacherCount: 9, metrics: M(58, 2.7, 37) },
    { bucket: 'Humanities', suppressed: false, teacherCount: 8, metrics: M(60, 2.8, 66) },
    { bucket: 'Other', suppressed: false, teacherCount: 5, combined: ['Arts', 'World languages'], metrics: M(55, 2.9, 50) },
  ] },
}

// The breakdown endpoint is one path with two answers.
const route = (pathname, params) =>
  pathname === '/api/admin/overview/breakdown' ? 'breakdown:' + params.get('by') : pathname

await withChrome({ fixtures: FIXTURES, route }, async ({ open, pdf, shoot, viewport, evaluate, sleep }) => {
  // Pilot report: the PDF, then its first page as the preview image.
  await open('/admin/pilot-report?sample=1')
  await pdf('pilot-report.pdf')
  await shoot('pilot-report.png', `() => [
    document.querySelector('header'),
    [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === 'Adoption'),
  ]`)

  // The admin pages sit beside two navigation columns; a wider window gives
  // their content the room a principal's laptop would.
  await viewport(1760)

  // Dashboard: At a glance + What needs your attention.
  await open('/admin')
  await shoot('admin-dashboard.png', `() => [
    [...document.querySelectorAll('p')].find(p => p.textContent === 'At a glance').parentElement,
    [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === 'What needs your attention'),
  ]`)

  // Professional Learning: the tracked focus area.
  await evaluate(`[...document.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Professional Learning').click()`)
  await sleep(1500)
  await shoot('admin-pd-progress.png', `() => [[...document.querySelectorAll('h3')].find(h => h.textContent === 'Talk time balance').closest('.rounded-3xl')]`)
})
