// Which lesson plan formats a teacher can use, and which one their lessons
// use unless they pick another. Shared by the templates routes and the
// lesson layout route.

import type { LessonTemplate } from '../generated/prisma/client.ts'
import { prisma } from './prisma.ts'

export type TemplateOwner = {
  id: string
  role: string
  organizationId: string | null
  organizationName: string | null
}

export async function loadTemplateOwner(userId: string): Promise<TemplateOwner | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, organizationId: true, organization: { select: { name: true } } },
  })
  if (!user) return null
  return { id: user.id, role: user.role, organizationId: user.organizationId, organizationName: user.organization?.name ?? null }
}

/// The teacher's own formats and their school's, newest first. The default is
/// the teacher's own default when they have one — a teacher who uploaded
/// their own format chose it over the school's — and otherwise the school's.
export async function listTemplatesFor(owner: TemplateOwner): Promise<{
  personal: LessonTemplate[]
  school: LessonTemplate[]
  defaultId: string | null
}> {
  const [personal, school] = await Promise.all([
    prisma.lessonTemplate.findMany({ where: { userId: owner.id, archivedAt: null }, orderBy: { createdAt: 'desc' } }),
    owner.organizationId
      ? prisma.lessonTemplate.findMany({ where: { organizationId: owner.organizationId, archivedAt: null }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
  ])
  const defaultId = personal.find((t) => t.isDefault)?.id ?? school.find((t) => t.isDefault)?.id ?? null
  return { personal, school, defaultId }
}

/// The format a lesson is laid out in: the one the teacher picked for it, or
/// their default. Null means Wivoza's own layout — picked, or nothing set up.
/// A picked format that has since been archived falls back to the default
/// rather than to nothing, so a deleted format never strands a lesson.
export async function templateForChoice(owner: TemplateOwner, choice: string | null): Promise<LessonTemplate | null> {
  if (choice === 'wivoza') return null
  const { personal, school, defaultId } = await listTemplatesFor(owner)
  const all = [...personal, ...school]
  return all.find((t) => t.id === choice) ?? all.find((t) => t.id === defaultId) ?? null
}
