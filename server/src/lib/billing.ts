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

// True if the user's own subscription is active, OR their organization
// grants paid access (a signed district contract, or a still-open free
// pilot window) — either path grants the same Plus-equivalent access.
export async function hasActivePlan(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      planStatus: true,
      organization: { select: { plan: true, pilotEndsAt: true } },
    },
  })
  if (!user) return false
  if (user.plan === 'plus' && user.planStatus === 'active') return true
  if (user.organization?.plan === 'district') return true
  if (user.organization?.pilotEndsAt && user.organization.pilotEndsAt > new Date()) return true
  return false
}

export async function checkFeatureAccess(
  userId: string,
  area: FeatureArea,
  countThisMonth: () => Promise<number>,
): Promise<{ allowed: boolean; upgradeMessage?: string }> {
  const paid = await hasActivePlan(userId)
  const limit = paid ? PAID_MONTHLY_LIMITS[area] : FREE_MONTHLY_LIMITS[area]
  if (limit === 0) return { allowed: false, upgradeMessage: UPGRADE_MESSAGES[area] }
  const count = await countThisMonth()
  if (count >= limit) return { allowed: false, upgradeMessage: UPGRADE_MESSAGES[area] }
  return { allowed: true }
}
