// Coaching Priorities: every database read and write, in one place, so the
// privacy rule has one place to hold. See docs/coaching-priorities.md.
//
// The rule: admin code reads SchoolPriority through ADMIN_PRIORITY_SELECT and
// never touches TeacherPriorityChoice. Only the teacher's own routes and their
// own coaching read a choice, and only their own. A privacy test checks both.

import { prisma } from './prisma.ts'
import { focusApplies, needsChoice, type ChoiceState, type Guidance } from './schoolPriorityRules.ts'
import type { FocusForPrompt } from './schoolFocusBlock.ts'

/// What an admin route may read of a priority: its own fields, no relations.
/// `choices` is deliberately absent.
export const ADMIN_PRIORITY_SELECT = {
  id: true,
  name: true,
  purpose: true,
  looksLike: true,
  whenItFits: true,
  ideas: true,
  whenNotToUse: true,
  startsOn: true,
  endsOn: true,
  status: true,
  version: true,
  changeNote: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const

const FOCUS_FIELDS = {
  id: true,
  organizationId: true,
  status: true,
  version: true,
  startsOn: true,
  endsOn: true,
  name: true,
  purpose: true,
  looksLike: true,
  whenItFits: true,
  ideas: true,
  whenNotToUse: true,
  changeNote: true,
} as const

function guidanceOf(p: Guidance & { id: string }): FocusForPrompt {
  return {
    id: p.id,
    name: p.name,
    purpose: p.purpose,
    looksLike: p.looksLike,
    whenItFits: p.whenItFits,
    ideas: p.ideas,
    whenNotToUse: p.whenNotToUse,
  }
}

/// The focuses to put in this teacher's coaching right now — usually none.
/// Never throws: coaching must not fail because of this feature, so any error
/// means no focus.
export async function activeFocusFor(userId: string, now = new Date()): Promise<FocusForPrompt[]> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
    if (!user?.organizationId) return []
    const choices = await prisma.teacherPriorityChoice.findMany({
      where: { userId, state: 'on', priority: { organizationId: user.organizationId, status: 'active' } },
      select: { state: true, version: true, priority: { select: FOCUS_FIELDS } },
    })
    return choices
      .filter((c) => focusApplies(c.priority, c, user.organizationId, now))
      .map((c) => guidanceOf(c.priority))
  } catch (error) {
    console.error('[schoolPriorities] active focus read failed:', error)
    return []
  }
}

export type TeacherFocusItem = Guidance & {
  id: string
  state: ChoiceState | null
  needsChoice: boolean
  changeNote: string | null
  startsOn: Date | null
  endsOn: Date | null
  /// true when the teacher had answered an earlier version and the school has
  /// since changed what it means — the invitation says so.
  changed: boolean
}

/// What a teacher sees of their school's priorities, with their own answers.
/// Their own choices only; there is no way to ask for anyone else's.
export async function teacherFocusList(userId: string, now = new Date()): Promise<TeacherFocusItem[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  if (!user?.organizationId) return []
  const priorities = await prisma.schoolPriority.findMany({
    where: { organizationId: user.organizationId, status: 'active' },
    orderBy: { publishedAt: 'asc' },
    select: { ...FOCUS_FIELDS, choices: { where: { userId }, select: { state: true, version: true } } },
  })
  return priorities
    .filter((p) => !p.endsOn || now < new Date(p.endsOn.getTime() + 24 * 60 * 60 * 1000))
    .map((p) => {
      const choice = p.choices[0] ?? null
      const current = choice && choice.version === p.version ? (choice.state as ChoiceState) : null
      return {
        ...guidanceOf(p),
        state: current,
        needsChoice: needsChoice(p, choice, now),
        changed: choice != null && choice.version !== p.version,
        changeNote: p.changeNote,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
      }
    })
}

/// Records a teacher's own answer at the priority's current version. Returns
/// false when the priority is not an active one of their own school.
export async function setTeacherChoice(userId: string, priorityId: string, state: ChoiceState): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  if (!user?.organizationId) return false
  const priority = await prisma.schoolPriority.findFirst({
    where: { id: priorityId, organizationId: user.organizationId, status: 'active' },
    select: { version: true },
  })
  if (!priority) return false
  await prisma.teacherPriorityChoice.upsert({
    where: { userId_priorityId: { userId, priorityId } },
    create: { userId, priorityId, state, version: priority.version },
    update: { state, version: priority.version },
  })
  return true
}
