// The four things teachers bring to a coach — the top level of Ask & Practice.
// Mirrors `server/src/lib/focusAreas.ts`, labels and sub-categories only: the
// coaching instructions that make each area behave differently live on the
// server and are never shipped to a browser.
//
// The six original categories are Classroom Management's sub-categories here,
// which is why nothing already saved needed relabelling.

/// The one section that asks about subject, course and level — those fields
/// are what its coaching is about, and mean nothing for the other three.
export const TEACHING_AND_LEARNING = 'teaching_and_learning'

export type SubCategory = { label: string; value: string }

export type FocusArea = {
  value: string
  label: string
  /// One or two words, for the chip rows where the full label would wrap.
  shortLabel: string
  /// What this area covers, in a teacher's words.
  blurb: string
  /// One example of each mode, for the teacher's guide.
  askExample: string
  practiceExample: string
  subCategories: SubCategory[]
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    value: 'teaching_and_learning',
    label: 'Teaching and Learning',
    shortLabel: 'Teaching',
    blurb: 'Explaining, questioning, checking, pacing — and grading what comes back.',
    askExample: 'I explain it well and half the room still does not have it.',
    practiceExample: 'A student says plants get their food from the soil.',
    subCategories: [
      { label: 'Explaining clearly', value: 'explaining_clearly' },
      { label: 'Checking for understanding', value: 'checking_understanding' },
      { label: 'Questioning & discussion', value: 'questioning_discussion' },
      { label: 'Pacing & chunking', value: 'pacing_chunking' },
      { label: 'Reaching every level', value: 'reaching_every_level' },
      { label: 'Student misconceptions', value: 'misconceptions' },
      { label: 'Planning & sequencing', value: 'content_sequencing' },
      { label: 'Feedback & grading', value: 'feedback_and_grading' },
    ],
  },
  {
    value: 'classroom_management',
    label: 'Classroom Management',
    shortLabel: 'Classroom',
    blurb: 'Behavior, routines, and getting the room with you.',
    askExample: 'My class talks over directions.',
    practiceExample: 'A student refuses to move to their assigned seat.',
    subCategories: [
      { label: 'Responding to resistance', value: 'defiance' },
      { label: 'Engagement & participation', value: 'disengagement' },
      { label: 'Conflict & repair', value: 'peer_conflict' },
      { label: 'Interruptions & redirection', value: 'disruption' },
      { label: 'Routines & transitions', value: 'transitions' },
      { label: 'Devices & digital routines', value: 'technology_misuse' },
    ],
  },
  {
    value: 'parent_communication',
    label: 'Parent Communication',
    shortLabel: 'Parents',
    blurb: 'Hard emails, conferences, and hard news — said well.',
    askExample: 'A parent email is accusatory and I do not know how to answer.',
    practiceExample: 'A parent writes: "That is not what I expect from her teacher."',
    subCategories: [
      { label: 'A difficult email', value: 'difficult_parent_email' },
      { label: 'Conferences', value: 'conferences' },
      { label: 'Delivering hard news', value: 'delivering_hard_news' },
      { label: 'Building a partnership', value: 'building_partnership' },
    ],
  },
  {
    value: 'professionalism',
    label: 'Professionalism',
    shortLabel: 'Professional',
    blurb: 'Co-teachers, admin, team time, paperwork, and growing as a teacher.',
    askExample: 'A co-teacher keeps overriding me in front of students.',
    practiceExample: 'Your co-teacher re-explains your task, mid-class.',
    subCategories: [
      { label: 'Co-teaching', value: 'co_teaching' },
      { label: 'Disagreeing with a peer', value: 'disagreeing_with_a_peer' },
      { label: 'Talking with admin', value: 'talking_with_admin' },
      { label: 'Team & PLC time', value: 'team_and_plc_time' },
      { label: 'Mentoring & growth', value: 'mentoring' },
      { label: 'Records & deadlines', value: 'records_and_deadlines' },
    ],
  },
]

export function findFocusArea(value: string | null | undefined): FocusArea | undefined {
  if (!value) return undefined
  return FOCUS_AREAS.find((a) => a.value === value)
}

export function focusAreaLabel(value: string | null | undefined): string | null {
  return findFocusArea(value)?.label ?? null
}

/// The area a sub-category belongs to — how rows saved before the area axis
/// existed (all of them carrying one of the six behavior categories) still
/// show the right area label in history and exports.
export function focusAreaForCategory(category: string | null | undefined): FocusArea | undefined {
  if (!category) return undefined
  return FOCUS_AREAS.find((a) => a.subCategories.some((c) => c.value === category))
}

/// Sub-categories for one area. No area selected means Practice can draw from
/// all four, so the picker has nothing to scope to.
export function subCategoriesFor(focusArea: string | null | undefined): SubCategory[] {
  return findFocusArea(focusArea)?.subCategories ?? []
}
