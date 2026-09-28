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
  /// First-person openers for Ask — sent verbatim as the teacher's first turn,
  /// so they have to be things a teacher would actually say out loud.
  askStarters: string[]
  /// Practice openers. Each carries the sub-category it should generate from.
  practiceStarters: { label: string; category: string }[]
  /// For the areas that overlap Communication Coach: where to send a teacher
  /// who needs the actual artifact rather than a quick rehearsal.
  handoff?: { label: string; to: string }
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
    askStarters: [
      "I explain something well and half the room still doesn't have it.",
      'The same three students answer every question I ask.',
      "There's one idea in this unit they get wrong every single year.",
      "I can't tell if my grades are fair or just consistent.",
    ],
    practiceStarters: [
      { label: 'Half the class looks blank after two explanations', category: 'checking_understanding' },
      { label: 'A misconception that survives everything you try', category: 'misconceptions' },
      { label: 'A piece of work sitting between two rubric levels', category: 'feedback_and_grading' },
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
    askStarters: [
      'My class talks over directions.',
      'A student pushed back in front of everyone and I froze.',
      "My routines work but they've gone stale.",
      'Getting started takes five minutes every single day.',
    ],
    practiceStarters: [
      { label: 'A student is checked out and not participating', category: 'disengagement' },
      { label: 'A student pushes back when you ask them to do something', category: 'defiance' },
      { label: 'The class is slow to settle into a routine', category: 'transitions' },
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
    handoff: {
      label: 'Need the actual email drafted, or a conference prepared? Communication Coach does that.',
      to: '/communications',
    },
    askStarters: [
      'A parent email is stressing me out.',
      "I have to tell a parent something they won't want to hear.",
      "A conference is coming up and I'm dreading it.",
      'A parent only ever hears from me when something is wrong.',
    ],
    practiceStarters: [
      { label: 'An accusatory parent email you have to answer', category: 'difficult_parent_email' },
      { label: 'A parent opens a conference by criticizing your class', category: 'conferences' },
      { label: 'A phone call about a student who is going to fail', category: 'delivering_hard_news' },
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
    handoff: {
      label: 'Need to prepare a whole meeting, or draft the message first? Communication Coach does that.',
      to: '/communications?tool=prepare',
    },
    askStarters: [
      'My co-teacher keeps overriding me in front of students.',
      'I need to raise a concern with someone more senior than me.',
      'Our team meetings never get to the work we planned.',
      "I'm behind on paperwork and it's starting to show.",
    ],
    practiceStarters: [
      { label: 'A co-teacher contradicts you mid-lesson', category: 'co_teaching' },
      { label: 'Your department decides something you think is wrong for kids', category: 'talking_with_admin' },
      { label: 'A colleague writes off a student you share', category: 'disagreeing_with_a_peer' },
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
