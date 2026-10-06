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
  /// For the areas that overlap Communication Coach: where to send a teacher
  /// who needs the actual artifact rather than a quick rehearsal.
  handoff?: { label: string; to: string }
  /// Which rehearsal this area opens. Client-only, and deliberately not mirrored
  /// on the server: both engines are ordinary endpoints that neither know nor
  /// care which chip a teacher pressed.
  ///   'scenario'     — a generated classroom moment, answered once, coached with
  ///                    feedback and a model response (Scenario/ScenarioAttempt).
  ///   'conversation' — a role-play against a person who pushes back, rated on six
  ///                    dimensions (ConversationPrep). This used to be Communication
  ///                    Coach's "Practice a Conversation" card; it sits here now
  ///                    because rehearsing is Practice's job, and what stayed behind
  ///                    there all ends in something you send or carry into a room.
  /// Exactly one area uses 'conversation' (see CONVERSATION_AREA). Professionalism
  /// looks conversational but is not only that — records, deadlines and PLC time are
  /// not role-plays — so it keeps the scenario engine and the whole of its range.
  engine: 'scenario' | 'conversation'
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    value: 'teaching_and_learning',
    engine: 'scenario',
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
    engine: 'scenario',
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
    // The value stays parent_communication: every saved Scenario, Debrief and
    // ConversationPrep row carries it, and a label is not worth a migration. The
    // area covers all four person types now, not just families.
    value: 'parent_communication',
    engine: 'conversation',
    label: 'Conversation',
    shortLabel: 'Conversation',
    blurb: 'A conversation you are dreading — with a parent, a student, a colleague, or an administrator.',
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
  },
  {
    value: 'professionalism',
    engine: 'scenario',
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

/// The one area whose engine is 'conversation' — where every handoff into a
/// role-play lands. Who the teacher is facing rides along in the prefill, so this
/// only has to name the section.
export const CONVERSATION_AREA = 'parent_communication'
