// Supervisors are assigned by the school's admin (or a superadmin), always
// within one school. When a
// person leaves or changes school, every supervision link through them ends —
// theirs and anyone they supervised — so a shared Self-Eval can never follow
// a teacher or a supervisor to another school.

import { prisma } from './prisma.ts'

export async function endSupervisionFor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { supervisorId: null } }),
    prisma.user.updateMany({ where: { supervisorId: userId }, data: { supervisorId: null } }),
  ])
}

// Who may be this person's supervisor: someone else, in the same school.
export async function supervisorError(targetId: string, schoolId: string | null, supervisorId: unknown): Promise<string | null> {
  if (supervisorId === null) return null
  if (typeof supervisorId !== 'string' || !supervisorId) return 'supervisorId must be a user id or null'
  if (supervisorId === targetId) return 'Someone cannot be their own supervisor.'
  if (!schoolId) return 'Only someone in a school can have a supervisor.'
  const supervisor = await prisma.user.findUnique({ where: { id: supervisorId }, select: { organizationId: true } })
  if (!supervisor || supervisor.organizationId !== schoolId) return 'The supervisor must be in the same school.'
  return null
}
