import { prisma } from './prisma.ts'

// Talk It Through and Ask & Practice are deliberately not gated at all —
// free forever for everyone, protected only by the existing flat daily
// ceiling in usageLimit.ts. These three are the only areas the Free tier
// caps or blocks.
export type FeatureArea = 'lesson_debrief' | 'lesson_planning' | 'communications'

const FREE_MONTHLY_LIMITS: Record<FeatureArea, number> = {
  lesson_debrief: 3,
  lesson_planning: 0,
  communications: 0,
}

// Generous soft ceilings on the paid side — not a monetization lever,
// just the same cost-protection spirit as the existing daily ceiling.
const PAID_MONTHLY_LIMITS: Record<FeatureArea, number> = {
  lesson_debrief: 60,
  lesson_planning: 60,
  communications: 100,
}

const UPGRADE_MESSAGES: Record<FeatureArea, string> = {
  lesson_debrief: "You've used your 3 free Lesson Debrief recordings this month. Upgrade to Wivoza Plus in Profile & Settings for unlimited recordings.",
  lesson_planning: 'Lesson Planning is part of Wivoza Plus. Upgrade in Profile & Settings to unlock it.',
  communications: 'Messages is part of Wivoza Plus. Upgrade in Profile & Settings to unlock it.',
}

export function startOfCurrentMonth(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// Shared counting helper for the lesson_planning/communications areas,
// which (unlike lesson_debrief) already have their Claude calls logged
// via checkAndLogUsage under existing UsageAction names — no new table
// needed, just a narrower, monthly-windowed count over the same log.
export function countUsageLogActionsThisMonth(userId: string, actions: string[]): Promise<number> {
  return prisma.usageLog.count({
    where: { userId, action: { in: actions }, createdAt: { gte: startOfCurrentMonth() } },
  })
}

// The Communications area spans three route files (parentMessage.ts,
// conversationPrep.ts, conversationPlan.ts) — one shared list so a future
// new action in any of them doesn't silently fall outside the gate.
export const COMMUNICATIONS_ACTIONS = [
  'parent_message',
  'parent_message_chat',
  'conversation_prep_feedback',
  'conversation_prep_generate',
  'conversation_prep_chat',
  'conversation_plan_feedback',
  'conversation_plan_chat',
]

// Spans lessonPlans.ts and assignmentCoach.ts — one shared list so a
// future new action in either file doesn't silently fall outside the gate.
export const LESSON_PLANNING_ACTIONS = [
  'lesson_plan_feedback',
  'lesson_plan_generate',
  'lesson_plan_chat',
  'assignment_coach',
  'assignment_coach_chat',
  'assignment_coach_finalize',
  'assignment_coach_review',
  'assignment_coach_ai_resistant',
  'lesson_plan_delivery_feedback',
  'lesson_plan_presentation_review',
]

// Accounts that must never hit a wall or a paywall — the App Store review
// demo login above all, since a reviewer who gets blocked mid-review files a
// rejection. Same env-driven pattern as ADMIN_EMAILS in auth.ts, but
// deliberately NOT superadmin: a reviewer should see exactly what a teacher
// sees, not the admin panel.
const DEMO_ACCOUNT_EMAILS = new Set(
  (process.env.DEMO_ACCOUNT_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

export function isDemoAccount(email: string | null | undefined): boolean {
  return email != null && DEMO_ACCOUNT_EMAILS.has(email.toLowerCase())
}

// True if the user's own subscription is active, OR their organization
// grants paid access (a signed district contract, or a still-open free
// pilot window) — either path grants the same Plus-equivalent access.
// Limits were lifted for everyone during early access (2026-09-06). They are
// back on, matching the plans as the home page describes them: Free gets
// Talk It Through, Ask & Practice and 3 Lesson Debriefs a month; Lesson
// Planning, Assignment Coach and Communication Coach are Plus.
//
// App Store review depends on DEMO_ACCOUNT_EMAILS being set wherever this
// runs. With limits on, a reviewer account that is not listed there is just a
// free teacher, and every Plus feature it opens answers with an upgrade
// message pointing at wivoza.com.
const LIMITS_LIFTED_FOR_EVERYONE = false

// The fields a plan decision needs. Callers that have already loaded the
// user — the live coaching turns, which cannot afford a second round trip to
// Postgres just to re-read the same row — select this shape and answer the
// question without going back to the database.
export const PLAN_USER_SELECT = {
  role: true,
  email: true,
  plan: true,
  planStatus: true,
  organization: { select: { plan: true, pilotEndsAt: true } },
} as const

export type PlanUser = {
  role: string | null
  email: string | null
  plan: string | null
  planStatus: string | null
  organization: { plan: string | null; pilotEndsAt: Date | null } | null
}

export function hasActivePlanFor(user: PlanUser | null): boolean {
  if (LIMITS_LIFTED_FOR_EVERYONE) return true
  if (!user) return false
  // App Store review demo logins get full access without superadmin.
  if (isDemoAccount(user.email)) return true
  // Superadmin needs to exercise every feature area to support/verify the
  // platform — never blocked behind a paywall meant for teachers.
  if (user.role === 'superadmin') return true
  if (user.plan === 'plus' && user.planStatus === 'active') return true
  if (user.organization?.plan === 'district') return true
  if (user.organization?.pilotEndsAt && user.organization.pilotEndsAt > new Date()) return true
  return false
}

export async function hasActivePlan(userId: string): Promise<boolean> {
  if (LIMITS_LIFTED_FOR_EVERYONE) return true

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PLAN_USER_SELECT,
  })
  return hasActivePlanFor(user)
}

export async function checkFeatureAccess(
  userId: string,
  area: FeatureArea,
  countThisMonth: () => Promise<number>,
): Promise<{ allowed: boolean; upgradeMessage?: string }> {
  // Superadmin never hits the monthly soft ceiling either — same reasoning
  // as the daily cap's bypass in usageLimit.ts.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role === 'superadmin') return { allowed: true }

  const paid = await hasActivePlan(userId)
  const limit = paid ? PAID_MONTHLY_LIMITS[area] : FREE_MONTHLY_LIMITS[area]
  if (limit === 0) return { allowed: false, upgradeMessage: UPGRADE_MESSAGES[area] }
  const count = await countThisMonth()
  if (count >= limit) return { allowed: false, upgradeMessage: UPGRADE_MESSAGES[area] }
  return { allowed: true }
}
