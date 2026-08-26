import { prisma } from './prisma.ts'

const DAILY_ACTION_LIMIT = Number(process.env.DAILY_ACTION_LIMIT) || 50

export type UsageAction =
  | 'scenario_generate'
  | 'attempt_feedback'
  | 'debrief_feedback'
  | 'parent_message'
  | 'qa_ask'
  | 'audio_session_notes'
  | 'lesson_plan_feedback'
  | 'lesson_plan_generate'

// Counts today's Claude-costing calls for this user and logs this one if
// they're still under the daily cap. One shared API key funds every
// teacher's usage, so this is the cost-protection backstop for a public app.
export async function checkAndLogUsage(userId: string, action: UsageAction): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const countToday = await prisma.usageLog.count({
    where: { userId, createdAt: { gte: startOfDay } },
  })

  if (countToday >= DAILY_ACTION_LIMIT) return false

  await prisma.usageLog.create({ data: { userId, action } })
  return true
}
