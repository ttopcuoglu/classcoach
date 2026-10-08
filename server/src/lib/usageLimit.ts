import { hasActivePlanFor, isDemoAccount, PLAN_USER_SELECT, startOfCurrentMonth, type PlanUser } from './billing.ts'
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

// A daily ceiling bounds one bad day; it says nothing about a teacher who sits
// at it. 400 conversational turns a day across a school month is ~8,000 calls —
// more than the subscription is worth — and on the free tier it is unbounded
// cost against no revenue at all, since Talk It Through and Ask are free
// forever. So the conversational bucket carries a monthly ceiling as well as a
// daily one: 300 free (15 turns a school day) and 1200 paid (60 a day), both far
// above what a real teacher uses and both retunable from the environment
// without a deploy.
const MONTHLY_CONVERSATION_LIMIT = Number(process.env.MONTHLY_CONVERSATION_LIMIT) || 300
const PAID_MONTHLY_CONVERSATION_LIMIT = Number(process.env.PAID_MONTHLY_CONVERSATION_LIMIT) || 1200

// A denied call has to say which window it hit. "Try again tomorrow" is simply
// untrue of a ceiling that resets on the 1st, and a teacher who reads it will
// come back tomorrow and be told exactly the same thing.
export const DAILY_LIMIT_MESSAGE = "You've reached today's practice limit — try again tomorrow."
export const MONTHLY_LIMIT_MESSAGE =
  "You've used this month's coaching conversations. This resets on the 1st — and Talk It Through is always here again then."

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
  // Practice's conversation rehearsal. Same route file as the three
  // conversation_prep_* actions above and the same table, split off by source
  // because they are no longer the same product: these are Practice, which is
  // free forever, and those are Communication Coach's review, which is Plus.
  | 'conversation_practice_generate'
  | 'conversation_practice_feedback'
  | 'conversation_practice_chat'
  | 'reflect_chat'
  | 'content_notes'
  | 'rubric_lens'
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
  | 'assignment_coach_export'
  | 'lesson_plan_delivery_feedback'
  | 'lesson_plan_presentation_review'
  | 'lesson_plan_presentation_generate'
  | 'lesson_plan_delivery_deck'
  // Planning Coach. `adapt` drafts a Simplify / Add Challenge / Increase
  // Participation / Adjust Time revision; `infer_context` reads an uploaded
  // file for what it's about so the form can suggest a topic and subject.
  | 'lesson_plan_adapt'
  | 'lesson_plan_infer_context'

// Every turn-based call in the two free-forever features. Kept as one list so
// a future action in either area doesn't silently fall back into the flat cap.
export const CONVERSATIONAL_ACTIONS: readonly UsageAction[] = [
  'talk_to_me',
  'talk_to_me_chat',
  'talk_to_me_takeaway',
  'debrief_feedback',
  'debrief_chat',
  'scenario_generate',
  'attempt_feedback',
  'attempt_chat',
  // The other half of Practice. Same bucket as the scenario engine above, so
  // rehearsing a conversation is protected by the same free-forever ceiling
  // rather than a different one.
  'conversation_practice_generate',
  'conversation_practice_feedback',
  'conversation_practice_chat',
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
// Returns null when the call is allowed, or the message to show the teacher
// when it is not — so no caller has to guess which window was hit.
export async function checkUsage(userId: string, action: UsageAction, user?: UsageUser | null): Promise<string | null> {
  // One row, selected once, answers both the exemption check below and the
  // plan check further down. Callers that already have it pass it in; the
  // rest get a single query where there used to be two.
  const loaded: UsageUser | null =
    user !== undefined
      ? user
      : await prisma.user.findUnique({ where: { id: userId }, select: PLAN_USER_SELECT })
  // Superadmin and App Store review demo logins are logged but never capped.
  if (loaded?.role === 'superadmin' || isDemoAccount(loaded?.email)) return null

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  // Two independent buckets: a long Talk It Through session can no longer
  // exhaust the budget that Lesson Debrief analysis or plan generation needs.
  const conversational = CONVERSATIONAL_ACTIONS.includes(action)
  const bucket = conversational
    ? { in: [...CONVERSATIONAL_ACTIONS] }
    : { notIn: [...CONVERSATIONAL_ACTIONS] }

  // Both windows together rather than one after the other: this runs before
  // Claude is even asked, and the teacher waits through all of it.
  const [countToday, countThisMonth] = await Promise.all([
    prisma.usageLog.count({ where: { userId, createdAt: { gte: startOfDay }, action: bucket } }),
    conversational
      ? prisma.usageLog.count({ where: { userId, createdAt: { gte: startOfCurrentMonth() }, action: bucket } })
      : Promise.resolve(0),
  ])

  const paid = hasActivePlanFor(loaded)
  const dailyLimit = conversational
    ? DAILY_CONVERSATION_LIMIT
    : paid
      ? PAID_DAILY_ACTION_LIMIT
      : DAILY_ACTION_LIMIT
  if (countToday >= dailyLimit) return DAILY_LIMIT_MESSAGE

  const monthlyLimit = paid ? PAID_MONTHLY_CONVERSATION_LIMIT : MONTHLY_CONVERSATION_LIMIT
  if (conversational && countThisMonth >= monthlyLimit) return MONTHLY_LIMIT_MESSAGE

  return null
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
export async function checkAndLogUsage(userId: string, action: UsageAction): Promise<string | null> {
  const denied = await checkUsage(userId, action)
  if (denied) return denied
  await logUsage(userId, action)
  return null
}
