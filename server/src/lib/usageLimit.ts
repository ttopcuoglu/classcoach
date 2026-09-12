import { hasActivePlanFor, isDemoAccount, PLAN_USER_SELECT, type PlanUser } from './billing.ts'
import { prisma } from './prisma.ts'

const DAILY_ACTION_LIMIT = Number(process.env.DAILY_ACTION_LIMIT) || 50
// A Plus/District teacher already pays for (or is granted) unlimited access
// to the per-feature areas billing.ts gates — this flat daily ceiling exists
// purely as shared-API-key cost protection, not a monetization lever, so a
// paid teacher gets a generous multiple of it rather than the same cap a
// free teacher hits. Most real usage days are nowhere near either number;
// this only matters on a genuinely hard day, which is exactly when it
// shouldn't be the thing that gets in the way.
const PAID_DAILY_ACTION_LIMIT = Number(process.env.PAID_DAILY_ACTION_LIMIT) || 150
// Talk It Through and Ask & Practice are free forever for everyone, and both
// are turn-based: one useful voice conversation is a dozen-plus calls. Counted
// against the flat ceiling above, the deeper the conversation the sooner the
// teacher gets cut off — exactly backwards. So conversational turns are
// counted in their own bucket against their own, far higher ceiling. Still
// bounded (this is a shared API key), just bounded per-conversation-ish rather
// than punishing depth.
const DAILY_CONVERSATION_LIMIT = Number(process.env.DAILY_CONVERSATION_LIMIT) || 400

export type UsageAction =
  | 'scenario_generate'
  | 'attempt_feedback'
  | 'debrief_feedback'
  | 'parent_message'
  | 'audio_session_notes'
  | 'lesson_plan_feedback'
  | 'lesson_plan_generate'
  | 'conversation_prep_feedback'
  | 'conversation_prep_generate'
  | 'reflect_chat'
  | 'content_notes'
  | 'attempt_chat'
  | 'debrief_chat'
  | 'conversation_prep_chat'
  | 'parent_message_chat'
  | 'lesson_plan_chat'
  | 'conversation_plan_feedback'
  | 'conversation_plan_chat'
  | 'talk_to_me'
  | 'talk_to_me_chat'
  | 'talk_to_me_takeaway'
  | 'class_summary'
  | 'assignment_coach'
  | 'assignment_coach_chat'
  | 'assignment_coach_finalize'
  | 'assignment_coach_review'
  | 'assignment_coach_ai_resistant'
  | 'lesson_plan_delivery_feedback'
  | 'lesson_plan_presentation_review'

// Every turn-based call in the two free-forever features. Kept as one list so
// a future action in either area doesn't silently fall back into the flat cap.
const CONVERSATIONAL_ACTIONS: readonly UsageAction[] = [
  'talk_to_me',
  'talk_to_me_chat',
  'talk_to_me_takeaway',
  'debrief_feedback',
  'debrief_chat',
  'scenario_generate',
  'attempt_feedback',
  'attempt_chat',
]

// A user already loaded by the caller. The live coaching turns select this
// once and hand it to both the usage check and the plan check, rather than
// each of them fetching the same row again — six serial round trips to
// Postgres used to run before Claude was even asked for a reply, and the
// teacher waits through every one of them.
export type UsageUser = PlanUser

// Reads only. Says whether this call is allowed, without recording it —
// separated from the write so a caller on a latency-sensitive path can let
// the recording happen alongside the Claude request instead of ahead of it.
export async function checkUsage(userId: string, action: UsageAction, user?: UsageUser | null): Promise<boolean> {
  // One row, selected once, answers both the exemption check below and the
  // plan check further down. Callers that already have it pass it in; the
  // rest get a single query where there used to be two.
  const loaded: UsageUser | null =
    user !== undefined
      ? user
      : await prisma.user.findUnique({ where: { id: userId }, select: PLAN_USER_SELECT })
  // Superadmin and App Store review demo logins are logged but never capped.
  if (loaded?.role === 'superadmin' || isDemoAccount(loaded?.email)) return true

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  // Two independent buckets: a long Talk It Through session can no longer
  // exhaust the budget that Lesson Debrief analysis or plan generation needs.
  const conversational = CONVERSATIONAL_ACTIONS.includes(action)
  const countToday = await prisma.usageLog.count({
    where: {
      userId,
      createdAt: { gte: startOfDay },
      action: conversational
        ? { in: [...CONVERSATIONAL_ACTIONS] }
        : { notIn: [...CONVERSATIONAL_ACTIONS] },
    },
  })

  const limit = conversational
    ? DAILY_CONVERSATION_LIMIT
    : hasActivePlanFor(loaded)
      ? PAID_DAILY_ACTION_LIMIT
      : DAILY_ACTION_LIMIT
  return countToday < limit
}

// The write half. Failing to record a call must never fail the call itself:
// the cap exists to protect a shared API key from sustained overuse, and one
// unrecorded turn cannot threaten that, while a teacher losing a reply
// because an accounting insert failed very much matters to them.
export async function logUsage(userId: string, action: UsageAction): Promise<void> {
  try {
    await prisma.usageLog.create({ data: { userId, action } })
  } catch (error) {
    console.error('[usage] could not record usage:', error)
  }
}

// Counts today's Claude-costing calls for this user and logs this one if
// they're still under the applicable daily cap. One shared API key funds every
// teacher's usage, so this is the cost-protection backstop for a public app.
export async function checkAndLogUsage(userId: string, action: UsageAction): Promise<boolean> {
  const allowed = await checkUsage(userId, action)
  if (!allowed) return false
  await logUsage(userId, action)
  return true
}
