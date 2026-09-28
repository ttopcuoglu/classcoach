// The six things teachers bring to a coach — the top level of Ask & Practice.
// Mirrors `server/src/lib/focusAreas.ts`, labels and sub-categories only: the
// coaching instructions that make each area behave differently live on the
// server and are never shipped to a browser.
//
// The six original categories are Classroom Management's sub-categories here,
// which is why nothing already saved needed relabelling.

export type SubCategory = { label: string; value: string }

export type FocusArea = {
  value: string
  label: string
  /// Shown under the label on the picker — what this area covers, in a teacher's words.
  blurb: string
  /// One or two words, for the chip rows where the full label would wrap.
  shortLabel: string
  /// One example of each mode, so the picker teaches what the area is for.
  askExample: string
  practiceExample: string
  /// Report accent, so the six read as distinct choices rather than a row of pills.
  tint: string
  chipSelected: string
  subCategories: SubCategory[]
  /// First-person openers for Ask — sent verbatim as the teacher's first turn,
  /// so they have to be things a teacher would actually say out loud.
  askStarters: string[]
  /// Practice openers. Each carries the sub-category it should generate from.
  practiceStarters: { label: string; category: string }[]
  /// For the two areas that overlap Communication Coach: where to send a
  /// teacher who needs the actual artifact rather than a quick rehearsal.
  handoff?: { label: string; to: string }
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    value: 'delivery_of_instruction',
    label: 'Delivery of Instruction',
    shortLabel: 'Delivery',
    blurb: 'How you explain, question, check, and pace.',
    askExample: 'My explanations run long and I lose half the room.',
    practiceExample: 'Half the class still looks blank after two explanations.',
    tint: 'bg-peach-tint',
    chipSelected: 'border-terracotta bg-terracotta text-cream',
    subCategories: [
      { label: 'Explaining clearly', value: 'explaining_clearly' },
      { label: 'Checking for understanding', value: 'checking_understanding' },
      { label: 'Questioning & discussion', value: 'questioning_discussion' },
      { label: 'Pacing & chunking', value: 'pacing_chunking' },
      { label: 'Openings & hooks', value: 'openings_hooks' },
      { label: 'Reaching every level', value: 'reaching_every_level' },
    ],
    askStarters: [
      "I explain something well and half the room still doesn't have it.",
      'The same three students answer every question I ask.',
      'I always run out of time before the part that matters.',
    ],
    practiceStarters: [
      { label: 'Half the class looks blank after two explanations', category: 'checking_understanding' },
      { label: 'A discussion where only three students ever talk', category: 'questioning_discussion' },
      { label: 'A good student question that would derail the lesson', category: 'explaining_clearly' },
    ],
  },
  {
    value: 'content_pedagogy',
    label: 'Teaching Specific Content',
    shortLabel: 'Content',
    blurb: 'How to teach this topic so it lands.',
    askExample: 'How do I teach mitosis so it is not just vocabulary?',
    practiceExample: 'A student says plants get their food from the soil.',
    tint: 'bg-gold-tint',
    chipSelected: 'border-gold bg-gold text-forest',
    subCategories: [
      { label: 'Student misconceptions', value: 'misconceptions' },
      { label: 'Building an explanation', value: 'building_explanation' },
      { label: 'Examples & analogies', value: 'examples_analogies' },
      { label: 'Sequencing the content', value: 'content_sequencing' },
      { label: 'Academic vocabulary', value: 'academic_vocabulary' },
    ],
    askStarters: [
      "My students can do the procedure but can't say why it works.",
      "There's one idea in this unit they get wrong every single year.",
      "I need a better way into this topic than the one I've been using.",
    ],
    practiceStarters: [
      { label: 'A misconception that survives everything you try', category: 'misconceptions' },
      { label: 'A topic you have to build an explanation for from scratch', category: 'building_explanation' },
      { label: 'Choosing between two analogies for a hard idea', category: 'examples_analogies' },
    ],
  },
  {
    value: 'classroom_management',
    label: 'Classroom Management',
    shortLabel: 'Classroom',
    blurb: 'Behavior, routines, and getting the room with you.',
    askExample: 'My class talks over directions.',
    practiceExample: 'A student refuses to move to their assigned seat.',
    tint: 'bg-mint-tint',
    chipSelected: 'border-mint-tint bg-mint-tint text-forest',
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
    ],
    practiceStarters: [
      { label: 'A student is checked out and not participating', category: 'disengagement' },
      { label: 'A student pushes back when you ask them to do something', category: 'defiance' },
      { label: 'The class is slow to settle into a routine', category: 'transitions' },
    ],
  },
  {
    value: 'grading',
    label: 'Grading & Feedback',
    shortLabel: 'Grading',
    blurb: 'Fair grades, feedback that lands, a load you can carry.',
    askExample: 'How do I grade fairly when effort and mastery disagree?',
    practiceExample: 'Strong tests, four missing assignments, a 71 in the book.',
    tint: 'bg-peach-tint',
    chipSelected: 'border-terracotta bg-terracotta text-cream',
    subCategories: [
      { label: 'Feedback that lands', value: 'feedback_that_lands' },
      { label: 'Rubrics & consistency', value: 'rubrics_consistency' },
      { label: 'Grade disputes', value: 'grade_disputes' },
      { label: 'Late & missing work', value: 'late_and_missing' },
      { label: 'Grading workload', value: 'grading_workload' },
    ],
    askStarters: [
      "I can't tell if my grades are fair or just consistent.",
      "A student is contesting a grade and I'm not sure I can defend it.",
      "I spend every Sunday grading and I don't think anyone reads it.",
    ],
    practiceStarters: [
      { label: 'A piece of work sitting between two rubric levels', category: 'rubrics_consistency' },
      { label: 'Strong tests, missing homework, a failing average', category: 'late_and_missing' },
      { label: 'A student asks why they got a lower grade than a friend', category: 'grade_disputes' },
    ],
  },
  {
    value: 'parent_communication',
    label: 'Parent Communication',
    shortLabel: 'Parents',
    blurb: 'Hard emails, conferences, and hard news — said well.',
    askExample: 'A parent email is accusatory and I do not know how to answer.',
    practiceExample: 'A parent writes: "That is not what I expect from her teacher."',
    tint: 'bg-gold-tint',
    chipSelected: 'border-gold bg-gold text-forest',
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
    ],
    practiceStarters: [
      { label: 'An accusatory parent email you have to answer', category: 'difficult_parent_email' },
      { label: 'A parent opens a conference by criticizing your class', category: 'conferences' },
      { label: 'A phone call about a student who is going to fail', category: 'delivering_hard_news' },
    ],
  },
  {
    value: 'colleagues',
    label: 'Colleagues & Team',
    shortLabel: 'Colleagues',
    blurb: 'Co-teachers, meetings, admin asks, honest disagreement.',
    askExample: 'A co-teacher keeps overriding me in front of students.',
    practiceExample: 'Your co-teacher re-explains your task, mid-class.',
    tint: 'bg-mint-tint',
    chipSelected: 'border-mint-tint bg-mint-tint text-forest',
    subCategories: [
      { label: 'Co-teaching', value: 'co_teaching' },
      { label: 'Disagreeing with a peer', value: 'disagreeing_with_a_peer' },
      { label: 'Talking with admin', value: 'talking_with_admin' },
      { label: 'Team & PLC time', value: 'team_and_plc_time' },
      { label: 'Mentoring', value: 'mentoring' },
    ],
    handoff: {
      label: 'Need to prepare a whole meeting, or draft the message first? Communication Coach does that.',
      to: '/communications?tool=prepare',
    },
    askStarters: [
      'My co-teacher keeps overriding me in front of students.',
      'I need to raise a concern with someone more senior than me.',
      'Our team meetings never get to the work we planned.',
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

/// Sub-categories for one area, with the "any" option first. No area selected
/// means Practice can draw from all six, so the picker has nothing to scope to.
export function subCategoriesFor(focusArea: string | null | undefined): SubCategory[] {
  return findFocusArea(focusArea)?.subCategories ?? []
}
