import type { AdminOverview, PdFocusArea, PdFocusAreaSnapshot } from './api'

// Labels for the Lesson Debrief growth priorities counted in the admin
// overview's priorityTally, shared by the admin panel and the pilot report
// along with the plain-language wording both use, so the dashboard and the
// printed report never describe the same number two different ways.
export const PRIORITY_LABELS: Record<string, string> = {
  'talk-balance': 'Talk time balance',
  questioning: 'Higher-order questioning',
  'wait-time': 'Wait time after questions',
  cfu: 'Checking for understanding',
  feedback: 'Specific feedback',
}

// What each growth area actually means in a lesson — the rule that put a
// lesson in it, in the words a principal would use.
export const PRIORITY_MEANING: Record<string, string> = {
  'talk-balance': 'The teacher did 65% or more of the talking.',
  questioning: 'Fewer than 4 in 10 questions asked students to explain, compare or reason.',
  'wait-time': 'Students got under 3 seconds to think before someone answered.',
  cfu: 'A 10+ minute lesson with no check for understanding.',
  feedback: 'Most feedback was general ("good job") rather than specific.',
}

// Strengths come from the server with the percentage the name refers to.
export const STRENGTH_MEANING: Record<string, string> = {
  'Checks for understanding': 'of lessons included at least one check for understanding.',
  'Higher-order questioning': 'of questions asked students to explain, compare or reason.',
  'Real-life examples and connections': 'of lessons connected the content to real life or earlier learning.',
  'Calm classroom management': 'of lessons needed no redirections at all.',
  'Clear directions': 'of lessons included at least one clear, specific direction.',
}

export const PD_SUGGESTIONS: Record<string, string> = {
  'talk-balance': 'a short PD session on structuring more student talk time — think-pair-share, cold-call routines',
  questioning: 'a 15-minute micro-PD on higher-order question stems (why / explain / compare / justify)',
  'wait-time': 'a quick, low-lift practice: silently count to 3-5 after every question before calling on someone',
  cfu: 'a shared routine for quick checks for understanding — thumbs up/down, exit tickets, cold-call',
  feedback: 'a short workshop on giving specific rather than generic feedback during practice',
}

// "In 52% of lessons (13 of 25)" when the snapshot has shares; the old raw
// count for focus areas started before shares were tracked.
export function describeSnapshot(snapshot: Omit<PdFocusAreaSnapshot, 'capturedAt'>): string {
  if (snapshot.sessions != null && snapshot.sharePct != null) {
    return `In ${snapshot.sharePct}% of lessons (${snapshot.count} of ${snapshot.sessions})`
  }
  return `${snapshot.count}× · ${snapshot.teachers} teacher${snapshot.teachers === 1 ? '' : 's'}`
}

// A theme is a need, so a smaller share is the good direction. Silent until
// both sides have shares and "since" has enough lessons behind it.
export function describeTrend(
  baseline: Omit<PdFocusAreaSnapshot, 'capturedAt'>,
  since: Omit<PdFocusAreaSnapshot, 'capturedAt'> | null,
): { text: string; improving: boolean } | null {
  if (!since || since.confidence === 'none' || baseline.sharePct == null || since.sharePct == null) return null
  const change = since.sharePct - baseline.sharePct
  if (change <= -5) return { text: `Down ${-change} points since you started — it's showing up in fewer lessons.`, improving: true }
  if (change >= 5) return { text: `Up ${change} points since you started — worth another look at the plan.`, improving: false }
  return { text: 'About the same so far — give it a few more weeks of lessons.', improving: false }
}

function countOf(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

// The most common growth area nobody is tracking yet: the natural next PD
// focus, once it has come up in enough lessons to be more than noise.
export function nextUntrackedNeed(
  overview: AdminOverview,
  tracked: PdFocusArea[],
): { key: string; count: number; teachers: number } | null {
  const trackedKeys = new Set(tracked.filter((t) => t.status === 'active').map((t) => t.themeKey))
  const next = Object.entries(overview.priorityTally)
    .filter(([key, v]) => v.count >= 3 && !trackedKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)[0]
  return next ? { key: next[0], ...next[1] } : null
}

// The four-sentence answer both the Dashboard and the printed pilot report
// open with: who's using it, what a tracked focus area changed, the clearest
// strength, and what to work on next. Each line is left out when the data
// can't support it.
export function buildSchoolGlance(overview: AdminOverview, tracked: PdFocusArea[]): string[] {
  const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—')
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
  const lines = [
    `${overview.activeThisWeek} of ${overview.totalTeachers} teachers (${pctOf(overview.activeThisWeek, overview.totalTeachers)}) used Wivoza in this period, and ${overview.returningUsers} came back from the period before.`,
  ]
  for (const t of tracked.filter((f) => f.status === 'active')) {
    const trend = describeTrend(t.baselineSnapshot, t.currentSnapshot)
    if (trend && t.baselineSnapshot.sharePct != null && t.currentSnapshot?.sharePct != null) {
      lines.push(
        `Since focusing on ${t.title.toLowerCase()} on ${day(t.createdAt)}, it has gone from ${t.baselineSnapshot.sharePct}% of recorded lessons to ${t.currentSnapshot.sharePct}%.`,
      )
    }
  }
  const strength = overview.strengths[0]
  if (strength) {
    lines.push(`Clearest staff strength: ${strength.label.toLowerCase()}, ${strength.value}% ${STRENGTH_MEANING[strength.label] ?? ''}`.trim())
  }
  const next = nextUntrackedNeed(overview, tracked)
  if (next) {
    lines.push(
      `Suggested next focus: ${(PRIORITY_LABELS[next.key] ?? next.key).toLowerCase()}, which came up in ${countOf(next.count, 'lesson', 'lessons')} across ${countOf(next.teachers, 'teacher', 'teachers')}.`,
    )
  }
  return lines
}
