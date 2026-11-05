import { prisma } from './prisma.ts'

// Ending a school's agreement: everything its members wrote that can carry
// information about students is deleted, then the school itself. This is the
// promise in the Data Retention Policy ("School agreement ends") and in a
// school's student data privacy agreement.
//
// What goes is every record a teacher could have put a student into: lessons
// (with their transcripts and quote flags, by cascade), Talk It Through / Ask /
// Telegram conversations (Debrief, with their follow-ups), parent messages,
// conversation prep and plans, Assignment Coach sessions, their own Practice
// situations and every rehearsal attempt, and Coach's memory note. What stays
// is the account and what is only the teacher's own craft — lesson plans,
// their templates, Leader's Corner practice — because the FAQ promises a
// teacher's account belongs to them and goes with them to another school.
// Usage counts stay too; they hold no content.
//
// Members are found by organizationId, so the superadmin's own data goes too
// if they are a member of the school being ended. The confirm step in the
// admin screen shows every member first for that reason.

export type MemberDeletionCounts = {
  userId: string
  name: string | null
  email: string
  lessons: number
  conversations: number
  parentMessages: number
  conversationPrep: number
  conversationPlans: number
  assignmentSessions: number
  practice: number
  coachMemory: boolean
}

export type SchoolDeletionReport = {
  organizationId: string
  organizationName: string
  members: MemberDeletionCounts[]
}

export type SchoolDeletionReceipt = SchoolDeletionReport & { deletedAt: string }

async function countFor(userId: string) {
  const where = { userId }
  const [lessons, conversations, parentMessages, conversationPrep, conversationPlans, assignmentSessions, ownScenarios, attempts] =
    await Promise.all([
      prisma.audioSession.count({ where }),
      prisma.debrief.count({ where }),
      prisma.parentMessage.count({ where }),
      prisma.conversationPrep.count({ where }),
      prisma.conversationPlan.count({ where }),
      prisma.assignmentCoachSession.count({ where }),
      prisma.scenario.count({ where }),
      prisma.scenarioAttempt.count({ where }),
    ])
  return { lessons, conversations, parentMessages, conversationPrep, conversationPlans, assignmentSessions, practice: ownScenarios + attempts }
}

// What ending the agreement would delete, without deleting anything.
export async function previewSchoolDeletion(organizationId: string): Promise<SchoolDeletionReport | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } })
  if (!org) return null
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, coachMemory: true, previousCoachMemory: true },
    orderBy: { email: 'asc' },
  })
  const members: MemberDeletionCounts[] = []
  for (const user of users) {
    members.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      ...(await countFor(user.id)),
      coachMemory: Boolean(user.coachMemory || user.previousCoachMemory),
    })
  }
  return { organizationId: org.id, organizationName: org.name, members }
}

// Deletes it, in one transaction, and returns the receipt to send the school.
export async function endSchoolAgreement(organizationId: string, now = new Date()): Promise<SchoolDeletionReceipt | null> {
  const report = await previewSchoolDeletion(organizationId)
  if (!report) return null
  const userIds = report.members.map((m) => m.userId)
  const where = { userId: { in: userIds } }
  await prisma.$transaction([
    prisma.audioSession.deleteMany({ where }),
    prisma.debrief.deleteMany({ where }),
    prisma.parentMessage.deleteMany({ where }),
    prisma.conversationPrep.deleteMany({ where }),
    prisma.conversationPlan.deleteMany({ where }),
    prisma.assignmentCoachSession.deleteMany({ where }),
    prisma.scenarioAttempt.deleteMany({ where }),
    prisma.scenario.deleteMany({ where }),
    prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { coachMemory: null, previousCoachMemory: null },
    }),
    // Members become independent teachers (onDelete: SetNull); the school's
    // own priorities, focus areas, templates and LMS links cascade with it.
    prisma.organization.delete({ where: { id: organizationId } }),
  ])
  return { ...report, deletedAt: now.toISOString() }
}
