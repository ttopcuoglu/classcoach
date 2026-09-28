// The six things teachers actually bring to a coach. Until now Ask & Practice
// was classroom-management-only: every system prompt said "classroom
// management coach" and the one category list was entirely student behavior.
//
// Focus area is the new top level. The original six categories survive
// unchanged as `classroom_management`'s sub-categories, so every existing
// Debrief.category / Scenario.category row stays valid and the adaptive
// weighting, private growth ratings, and curated fallback bank keep working.
//
// Everything a system prompt needs to coach an area lives here rather than in
// the route files, because the prompts are the substance of this feature — a
// picker with six options in front of a coach that still talks about
// de-escalation is six doors into the same room. `web/src/lib/focusAreas.ts`
// and `ClassCoach/Models/API/FocusAreas.swift` mirror the labels only; the
// coaching text is server-side and never shipped to a client.

export type SubCategory = { value: string; label: string }

export type FocusArea = {
  value: string
  label: string
  /// Teacher-facing one-liner: what this area covers.
  blurb: string

  // --- Ask ---
  /// Completes "You are a warm, practical ___ for grades 6-12 teachers."
  coachRole: string
  /// What "something that already happened" looks like here. Outside
  /// classroom management an incident is rarely a moment in front of
  /// students — it can be an email thread, a returned assignment, or a
  /// hallway conversation.
  incidentShape: string
  /// The standard <feedback> is grounded in and <rating> is scored against.
  bestPractice: string

  // --- Practice ---
  /// What a practice scenario in this area actually IS. The behavior-shaped
  /// "a student does X" is wrong for four of the six areas.
  practiceArtifact: string
  /// What beginner / intermediate / advanced mean here.
  difficultyTiers: string
  /// Area-specific hard limits, on top of the shared ones.
  safety: string

  subCategories: SubCategory[]
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    value: 'delivery_of_instruction',
    label: 'Delivery of Instruction',
    blurb: 'How you explain, question, check, and pace — the moment-to-moment teaching.',
    coachRole:
      'instructional coach who helps teachers with how they deliver instruction — explaining, questioning, checking for understanding, pacing, and keeping a room of students with them',
    incidentShape:
      'a lesson or part of a lesson that already happened — an explanation that did not land, a discussion that went flat, a check for understanding that told them nothing, a class that was lost by minute ten',
    bestPractice:
      'instructional best practice (a clear learning goal students can name, modeling and think-alouds, worked examples before independent practice, frequent low-stakes checks for understanding that sample the whole room rather than the raised hands, real wait time, warm cold-calling, chunking, and releasing responsibility gradually)',
    practiceArtifact:
      'a delivery moment the teacher has to handle out loud, written as the situation they are standing in with a concrete detail — what they just said, what students just did, what a student just asked. For example: an explanation they have already given twice and half the room still looks blank; a discussion where the same three students answer everything; the need to check understanding in ninety seconds before moving on; a worked example that a student has just derailed with a reasonable question',
    difficultyTiers:
      '"beginner" gives one clear instructional problem with a well-known move available (a check for understanding is missing; the goal was never stated). "intermediate" adds a real constraint — little time left, a mixed-readiness room, a topic that resists a quick analogy. "advanced" puts two good instructional goals in tension: depth against coverage, keeping the strong students moving against not losing the rest, honoring a good student question against protecting the lesson arc',
    safety:
      'Keep the problem about the teaching itself. Student behavior may appear as texture but must never be the thing to solve — that is Classroom Management, a different area.',
    subCategories: [
      { value: 'explaining_clearly', label: 'Explaining clearly' },
      { value: 'checking_understanding', label: 'Checking for understanding' },
      { value: 'questioning_discussion', label: 'Questioning & discussion' },
      { value: 'pacing_chunking', label: 'Pacing & chunking' },
      { value: 'openings_hooks', label: 'Openings & hooks' },
      { value: 'reaching_every_level', label: 'Reaching every level' },
    ],
  },
  {
    value: 'content_pedagogy',
    label: 'Teaching Specific Content',
    blurb: 'Not whether you know the content — how to teach this topic so it lands.',
    coachRole:
      'pedagogical-content coach who helps teachers work out how to TEACH a specific topic. The teacher knows their content; what they need is how to make this particular idea land — never imply they have a knowledge gap, and never re-explain the subject matter to them as though they were the student',
    incidentShape:
      'a specific topic they already taught that did not land — the lesson on a concept where students could do the procedure but not say why, a unit where a misconception survived everything they tried, an explanation that worked last year and not this year',
    bestPractice:
      'pedagogical content knowledge (surfacing a misconception and confronting it directly rather than teaching over it, concrete before abstract, multiple representations of the same idea, well-chosen worked examples and analogies with their limits named out loud, questions that make the student do the intellectual work, and knowing the specific places this topic usually breaks)',
    practiceArtifact:
      'a content-teaching challenge in the teacher\'s own subject and grade. Always name the specific topic AND the specific wrong idea, in the student\'s own words — "a student says the heavier ball hits the ground first because it has more gravity pulling on it," never "a student is confused about the content." Other good shapes: a topic to build a first explanation for, a student question that reveals the whole class has missed the idea, choosing between two analogies, or sequencing three sub-ideas in the right order',
    difficultyTiers:
      '"beginner" is a common, well-documented misconception with a known instructional fix. "intermediate" is a misconception that is partly right, so it cannot simply be corrected — it has to be built on. "advanced" is an idea that is genuinely hard to represent (an abstraction with no good concrete analogue, or a topic where the usual analogy actively creates the next misconception)',
    safety:
      'Never invent subject facts you are not sure of; if a topic\'s specifics matter and you do not know them, coach the teacher on how to find the misconception rather than asserting content. Keep the focus on teaching the idea, not on student behavior.',
    subCategories: [
      { value: 'misconceptions', label: 'Student misconceptions' },
      { value: 'building_explanation', label: 'Building an explanation' },
      { value: 'examples_analogies', label: 'Examples & analogies' },
      { value: 'content_sequencing', label: 'Sequencing the content' },
      { value: 'academic_vocabulary', label: 'Academic vocabulary' },
    ],
  },
  {
    value: 'classroom_management',
    label: 'Classroom Management',
    blurb: 'Behavior, routines, and getting the room with you.',
    coachRole: 'classroom management coach',
    incidentShape:
      'a real incident that already happened in their classroom — a specific moment with a specific student or group, not a hypothetical',
    bestPractice:
      'classroom management best practice (clear and consistent expectations, de-escalation, restorative practices)',
    practiceArtifact:
      'an everyday classroom management challenge, concrete and specific — a short realistic dialogue snippet helps. For grade band "K-5", use age-appropriate elementary behaviors and language (sharing conflicts, following directions, tattling, difficulty sitting still, minor tantrums) and avoid teen-specific dynamics like phones, sarcasm, or eye-rolling',
    difficultyTiers:
      '"beginner" has a single clear behavior with an obvious response. "intermediate" adds some ambiguity or a mildly reluctant student. "advanced" has competing considerations — multiple students, conflicting needs, or a defiance layer stacked on the core issue',
    safety: 'Never include weapons, abuse, self-harm, or other extreme or rare situations.',
    subCategories: [
      { value: 'defiance', label: 'Responding to resistance' },
      { value: 'disengagement', label: 'Engagement & participation' },
      { value: 'peer_conflict', label: 'Conflict & repair' },
      { value: 'disruption', label: 'Interruptions & redirection' },
      { value: 'transitions', label: 'Routines & transitions' },
      { value: 'technology_misuse', label: 'Devices & digital routines' },
    ],
  },
  {
    value: 'grading',
    label: 'Grading & Feedback',
    blurb: 'Fair grades, feedback that lands, and a workload you can sustain.',
    coachRole: 'coach who helps teachers with grading, feedback, and assessment decisions',
    incidentShape:
      'a grading decision they already made or are sitting on — a grade a student or parent pushed back on, a stack they gave feedback on that nobody read, a rubric that put two very different pieces of work at the same score, a late-work call they are not sure was fair',
    bestPractice:
      'assessment best practice (grades that report what a student knows rather than how compliant they were, behavior and achievement reported separately, feedback that is specific, actionable, and arrives while the student can still use it, consistent rubric application with the criteria shared in advance, opportunities to revise toward mastery, and a grading load the teacher can actually sustain)',
    practiceArtifact:
      'a grading judgment call with enough specifics to actually decide — never a general question dressed up as a scenario. Good shapes: a described piece of student work sitting right on a boundary between two rubric levels; a student whose test scores are strong and whose missing homework is sinking the average; a late assignment with a reason attached; a rubric that has put a thoughtful-but-messy piece and a polished-but-shallow piece at the same score; a stack of thirty to give useful feedback on with forty minutes before it stops mattering. Include the numbers or the rubric language the decision turns on',
    difficultyTiers:
      '"beginner" has one clear principle that resolves it. "intermediate" has two defensible answers and a policy that does not quite cover the case. "advanced" puts fairness to this student against consistency for the rest of the class, or a defensible grade against a relationship the teacher needs to keep',
    safety:
      'Never write an academic-dishonesty investigation, an IEP/504 or special-education compliance decision, or a grade-change demand from an administrator — those need a specialist, not a coach. Keep it to ordinary grading judgment. Never advise anything that would disclose one student\'s grades to another family.',
    subCategories: [
      { value: 'feedback_that_lands', label: 'Feedback that lands' },
      { value: 'rubrics_consistency', label: 'Rubrics & consistency' },
      { value: 'grade_disputes', label: 'Grade disputes' },
      { value: 'late_and_missing', label: 'Late & missing work' },
      { value: 'grading_workload', label: 'Grading workload' },
    ],
  },
  {
    value: 'parent_communication',
    label: 'Parent Communication',
    blurb: 'Hard emails, conferences, and hard news — said well.',
    coachRole: 'coach who helps teachers communicate with parents and caregivers',
    incidentShape:
      'an exchange with a parent that already happened — an email they sent and regret, a reply that came back angrier than expected, a conference that went sideways, a phone call where they lost the thread',
    bestPractice:
      'family-communication best practice (lead with the student and something true and specific about them, describe observable facts rather than labels or diagnoses, no jargon, assume the parent wants the same thing you do, name one concrete next step and who owns it, offer a real chance for the parent to respond, and keep a written record of what was agreed)',
    practiceArtifact:
      'a parent moment the teacher has to respond to right now, with the parent\'s actual words quoted. Good shapes: the full text of a short parent email — three or four sentences, in a real parent\'s voice, not a caricature; the first thing a parent says when they sit down at a conference; what a parent says thirty seconds into a phone call the teacher initiated with hard news. Give the teacher enough background about the student to answer honestly',
    difficultyTiers:
      '"beginner" is a concerned parent asking a fair question. "intermediate" is a parent who is upset and partly right, so the reply cannot just be a defense. "advanced" is a parent who is angry, has copied an administrator, or is asking for something the teacher cannot give — and still has a legitimate underlying concern',
    safety:
      'Never write abuse, neglect, custody disputes, threats, or anything that would be a mandated-reporter situation — those are not coaching scenarios. Never invent a real, identifiable person. Keep it to a difficult but ordinary parent exchange, and never advise anything that discloses another student\'s information.',
    subCategories: [
      { value: 'difficult_parent_email', label: 'A difficult email' },
      { value: 'conferences', label: 'Conferences' },
      { value: 'delivering_hard_news', label: 'Delivering hard news' },
      { value: 'building_partnership', label: 'Building a partnership' },
    ],
  },
  {
    value: 'colleagues',
    label: 'Colleagues & Team',
    blurb: 'Co-teachers, department meetings, admin asks, and honest disagreement.',
    coachRole:
      'coach who helps teachers navigate working relationships with colleagues, co-teachers, and administrators',
    incidentShape:
      'something that already happened with a colleague — a co-teacher who contradicted them in front of students, a meeting where their concern got waved off, a peer who said something about a shared student, an admin request they agreed to and resent',
    bestPractice:
      'professional-collaboration best practice (separate the person from the problem, open with the interest you actually share — usually a student, describe observable behavior rather than attributing motive, ask what you might be missing before you conclude, make a specific request rather than a complaint, and know what genuinely needs escalating and to whom)',
    practiceArtifact:
      'a colleague moment with the other person\'s actual words, written as the line the teacher has to respond to. Good shapes: what a co-teacher said, in front of students, that undercut them; what a department head asked for in a meeting that the teacher thinks is wrong for kids; what a peer said about a student they share; what an administrator said when the teacher raised a concern. Give the working relationship enough history that the teacher\'s answer has a cost',
    difficultyTiers:
      '"beginner" is a small, clearly raisable friction with a willing colleague. "intermediate" is a colleague who is defensive or senior, where being right is not enough. "advanced" has a power difference and a real professional cost to speaking up, or a colleague whose approach the teacher disagrees with on behalf of students',
    safety:
      'Never write harassment, discrimination, misconduct, retaliation, or anything that belongs with HR, a union representative, or a lawyer — say plainly that those need that route, and do not coach around them. Keep it to ordinary professional friction, and never name a real, identifiable person.',
    subCategories: [
      { value: 'co_teaching', label: 'Co-teaching' },
      { value: 'disagreeing_with_a_peer', label: 'Disagreeing with a peer' },
      { value: 'talking_with_admin', label: 'Talking with admin' },
      { value: 'team_and_plc_time', label: 'Team & PLC time' },
      { value: 'mentoring', label: 'Mentoring' },
    ],
  },
]

export const FOCUS_AREA_VALUES = FOCUS_AREAS.map((a) => a.value) as readonly string[]

/// Every sub-category value across every area. Values are unique platform-wide
/// because `Scenario.category` / `Debrief.category` is a single column — a
/// sub-category identifies its area on its own, which is what lets legacy rows
/// (all six original behavior values) resolve to Classroom Management without
/// a backfill of the category column itself.
export const ALL_SUB_CATEGORIES: readonly string[] = FOCUS_AREAS.flatMap((a) =>
  a.subCategories.map((c) => c.value),
)

export function findFocusArea(value: unknown): FocusArea | null {
  if (typeof value !== 'string') return null
  return FOCUS_AREAS.find((a) => a.value === value) ?? null
}

/// The area a sub-category belongs to. Used to resolve rows written before
/// focusArea existed, all of which carry one of the six behavior categories.
export function focusAreaForSubCategory(category: unknown): FocusArea | null {
  if (typeof category !== 'string') return null
  return FOCUS_AREAS.find((a) => a.subCategories.some((c) => c.value === category)) ?? null
}

export function pickFocusArea(value: unknown): FocusArea {
  return findFocusArea(value) ?? FOCUS_AREAS[Math.floor(Math.random() * FOCUS_AREAS.length)]
}

/// Sub-category values for one area, or all of them when no area is given.
export function subCategoryValues(focusArea?: unknown): readonly string[] {
  const area = findFocusArea(focusArea)
  return area ? area.subCategories.map((c) => c.value) : ALL_SUB_CATEGORIES
}
