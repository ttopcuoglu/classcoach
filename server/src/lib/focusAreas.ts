// The four things teachers bring to a coach. Until recently Ask & Practice was
// classroom-management-only: every system prompt said "classroom management
// coach" and the one category list was entirely student behavior.
//
// Focus area is the top level. The six original categories survive unchanged as
// `classroom_management`'s sub-categories, so every existing Debrief.category /
// Scenario.category row stays valid and the adaptive weighting, private growth
// ratings, and curated fallback bank keep working.
//
// Everything a system prompt needs to coach an area lives here rather than in
// the route files, because the prompts are the substance of this feature — a
// picker with four options in front of a coach that still talks about
// de-escalation is four doors into the same room. `web/src/lib/focusAreas.ts`
// and `ClassCoach/Models/API/FocusAreas.swift` mirror the labels only; the
// coaching text is server-side and never shipped to a client.

/// The one section that asks about subject, course and level — those fields
/// are what its coaching is about, and mean nothing for the other three.
export const TEACHING_AND_LEARNING = 'teaching_and_learning'

export type SubCategory = { value: string; label: string }

export type FocusArea = {
  value: string
  label: string
  /// Teacher-facing one-liner: what this area covers.
  blurb: string

  // --- Ask ---
  /// Completes "You are a warm, practical ___ for K-12 teachers."
  coachRole: string
  /// What "something that already happened" looks like here. Outside classroom
  /// management an incident is rarely a moment in front of students — it can be
  /// an email thread, a returned assignment, or a hallway conversation.
  incidentShape: string
  /// The standard <feedback> is grounded in and <rating> is scored against.
  bestPractice: string

  // --- Practice ---
  /// What a practice scenario in this area actually IS. The behavior-shaped
  /// "a student does X" is wrong for three of the four areas.
  practiceArtifact: string
  /// What beginner / intermediate / advanced mean here.
  difficultyTiers: string
  /// Area-specific hard limits, on top of the shared ones.
  safety: string

  subCategories: SubCategory[]
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    value: 'teaching_and_learning',
    label: 'Teaching and Learning',
    blurb: 'Explaining, questioning, checking, pacing — and how you grade what comes back.',
    coachRole:
      'instructional coach who helps teachers with how they teach and how they assess: explaining, questioning, checking for understanding, pacing, getting a specific topic to land, and grading the work that comes back. The teacher knows their content; what they need is how to make it land — never imply a knowledge gap, and never re-explain their subject to them as though they were the student',
    incidentShape:
      'a lesson, a topic, or a stack of work they have already handled — an explanation that did not land, a discussion that went flat, a check for understanding that told them nothing, a misconception that survived everything they tried, a grade a student pushed back on, feedback nobody read',
    bestPractice:
      'instructional and assessment best practice: a clear learning goal students can name, modeling and think-alouds, worked examples before independent practice, frequent low-stakes checks that sample the whole room rather than the raised hands, real wait time, warm cold-calling, chunking, gradual release; surfacing a misconception and confronting it directly rather than teaching over it, concrete before abstract, multiple representations, questions that make the student do the intellectual work; and grades that report what a student knows rather than how compliant they were, feedback that is specific, actionable and arrives while the student can still use it, consistent rubric application, and a grading load the teacher can actually sustain',
    practiceArtifact:
      "a teaching or assessment moment the teacher has to handle, written as the situation they are standing in with a concrete detail — what they just said, what a student just asked, what is actually on the page in front of them. Good shapes: an explanation they have already given twice while half the room still looks blank; a discussion where the same three students answer everything; a misconception in the student's own words (\"the heavier ball lands first because more gravity pulls on it\"), never \"a student is confused about the content\"; a worked example a student has just derailed with a reasonable question; a described piece of student work sitting right on a boundary between two rubric levels, with the numbers or rubric language the decision turns on; a student whose test scores are strong and whose missing homework is sinking the average",
    difficultyTiers:
      '"beginner" gives one clear problem with a well-known move available — a check for understanding is missing, the goal was never stated, a common misconception with a documented fix, one principle that settles the grading call. "intermediate" adds a real constraint or genuine ambiguity: little time left, a mixed-readiness room, a misconception that is partly right and has to be built on, two defensible grades and a policy that does not quite cover the case. "advanced" puts two good goals in tension — depth against coverage, keeping the strong students moving against not losing the rest, fairness to this student against consistency for the rest of the class, or an idea that is genuinely hard to represent at all',
    safety:
      'Keep the problem about the teaching or the assessment itself. Student behavior may appear as texture but must never be the thing to solve — that is Classroom Management, a different area. Never invent subject facts you are not sure of; if a topic\'s specifics matter and you do not know them, coach the teacher on how to find the misconception rather than asserting content. Never write an academic-dishonesty investigation or an IEP/504 compliance decision — those need a specialist, not a coach — and never advise anything that would disclose one student\'s grades to another family.',
    subCategories: [
      { value: 'explaining_clearly', label: 'Explaining clearly' },
      { value: 'checking_understanding', label: 'Checking for understanding' },
      { value: 'questioning_discussion', label: 'Questioning & discussion' },
      { value: 'pacing_chunking', label: 'Pacing & chunking' },
      { value: 'reaching_every_level', label: 'Reaching every level' },
      { value: 'misconceptions', label: 'Student misconceptions' },
      { value: 'content_sequencing', label: 'Planning & sequencing' },
      { value: 'feedback_and_grading', label: 'Feedback & grading' },
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
      'an everyday classroom management challenge, concrete and specific — a short realistic dialogue snippet helps. In the early grades, use age-appropriate behaviors and language (sharing conflicts, following directions, tattling, difficulty sitting still, minor tantrums) and avoid teen-specific dynamics like phones, sarcasm, or eye-rolling',
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
    value: 'parent_communication',
    label: 'Parent Communication',
    blurb: 'Hard emails, conferences, and hard news — said well.',
    coachRole: 'coach who helps teachers communicate with parents and caregivers',
    incidentShape:
      'an exchange with a parent that already happened — an email they sent and regret, a reply that came back angrier than expected, a conference that went sideways, a phone call where they lost the thread',
    bestPractice:
      'family-communication best practice (lead with the student and something true and specific about them, describe observable facts rather than labels or diagnoses, no jargon, assume the parent wants the same thing you do, name one concrete next step and who owns it, offer a real chance for the parent to respond, and keep a written record of what was agreed)',
    practiceArtifact:
      "a parent moment the teacher has to respond to right now, with the parent's actual words quoted. Good shapes: the full text of a short parent email — three or four sentences, in a real parent's voice, not a caricature; the first thing a parent says when they sit down at a conference; what a parent says thirty seconds into a phone call the teacher initiated with hard news. Give the teacher enough background about the student to answer honestly",
    difficultyTiers:
      '"beginner" is a concerned parent asking a fair question. "intermediate" is a parent who is upset and partly right, so the reply cannot just be a defense. "advanced" is a parent who is angry, has copied an administrator, or is asking for something the teacher cannot give — and still has a legitimate underlying concern',
    safety:
      "Never write abuse, neglect, custody disputes, threats, or anything that would be a mandated-reporter situation — those are not coaching scenarios. Never invent a real, identifiable person. Keep it to a difficult but ordinary parent exchange, and never advise anything that discloses another student's information.",
    subCategories: [
      { value: 'difficult_parent_email', label: 'A difficult email' },
      { value: 'conferences', label: 'Conferences' },
      { value: 'delivering_hard_news', label: 'Delivering hard news' },
      { value: 'building_partnership', label: 'Building a partnership' },
    ],
  },
  {
    value: 'professionalism',
    label: 'Professionalism',
    blurb: 'Co-teachers, admin, team time, paperwork, and growing as a teacher.',
    coachRole:
      'coach who helps teachers with the professional side of the job — working relationships with colleagues, co-teachers and administrators, team and PLC time, records and deadlines, and their own growth',
    incidentShape:
      'something that already happened outside the lesson — a co-teacher who contradicted them in front of students, a meeting where their concern got waved off, a peer who said something about a shared student, an admin request they agreed to and resented, a deadline or piece of documentation they missed',
    bestPractice:
      'professional-practice best practice (separate the person from the problem, open with the interest you actually share — usually a student, describe observable behavior rather than attributing motive, ask what you might be missing before you conclude, make a specific request rather than a complaint, keep accurate and timely records, meet the commitments you make, seek feedback rather than waiting for it, and know what genuinely needs escalating and to whom)',
    practiceArtifact:
      "a professional moment with the other person's actual words, written as the line the teacher has to respond to. Good shapes: what a co-teacher said, in front of students, that undercut them; what a department head asked for in a meeting that the teacher thinks is wrong for kids; what a peer said about a student they share; what an administrator said when the teacher raised a concern; a PLC that has spent twenty of its forty-five minutes on the bell schedule. Give the working relationship enough history that the teacher's answer has a cost",
    difficultyTiers:
      '"beginner" is a small, clearly raisable friction with a willing colleague. "intermediate" is a colleague who is defensive or senior, where being right is not enough. "advanced" has a power difference and a real professional cost to speaking up, or a colleague whose approach the teacher disagrees with on behalf of students',
    safety:
      'Never write harassment, discrimination, misconduct, retaliation, or anything that belongs with HR, a union representative, or a lawyer — say plainly that those need that route, and do not coach around them. Keep it to ordinary professional friction, and never name a real, identifiable person.',
    subCategories: [
      { value: 'co_teaching', label: 'Co-teaching' },
      { value: 'disagreeing_with_a_peer', label: 'Disagreeing with a peer' },
      { value: 'talking_with_admin', label: 'Talking with admin' },
      { value: 'team_and_plc_time', label: 'Team & PLC time' },
      { value: 'mentoring', label: 'Mentoring & growth' },
      { value: 'records_and_deadlines', label: 'Records & deadlines' },
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
