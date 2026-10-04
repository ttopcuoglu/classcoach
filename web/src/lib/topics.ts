// The seven topics a teacher brings to a coach — one ordered list, shown
// identically in Talk It Through and Practice, and shown as the tag on every
// saved item.
//
// Mirrors `server/src/lib/topics.ts`, labels and kinds only. The coaching
// instructions that make each topic behave differently live on the server and
// are never shipped to a browser — that file is ~10x this one, and almost all
// of the difference is prompt text.
//
// Four of these seven values (`teaching_and_learning`, `classroom_management`,
// `parent_communication`, `professionalism`) are the pre-existing focus-area
// values unchanged, which is why nothing already saved needed relabelling.

/// The one topic that asks about subject, course and what is being taught
/// right now.
export const TEACHING_AND_LEARNING = 'teaching_and_learning'

/// The topic that carries no stance of its own — rendered as a dashed/ghost
/// chip, for a teacher who does not want to classify anything.
export const SOMETHING_ELSE = 'something_else'

/// The kind value stored when a teacher wrote the situation themselves. Not a
/// member of any topic's `kinds` — it is the teacher opting out of narrowing,
/// not something to narrow to. Mirrors DESCRIBE_MY_OWN on the server.
export const DESCRIBE_MY_OWN = 'describe_my_own'

export type TopicKind = { value: string; label: string }

export type Topic = {
  value: string
  label: string
  /// One or two words, for chip rows where the full label would wrap.
  shortLabel: string
  /// What this topic covers, in a teacher's words.
  blurb: string
  /// Rendered as a dashed/ghost chip rather than a solid one.
  ghost?: boolean
  /// Practice's "Kind" row. Practice also always offers "Describe my own",
  /// which is not a member of this list.
  kinds: TopicKind[]
}

export const TOPICS: Topic[] = [
  {
    value: 'teaching_and_learning',
    label: 'Teaching and Learning',
    shortLabel: 'Teaching',
    blurb: 'Explaining, questioning, checking, pacing — and grading what comes back.',
    kinds: [
      { value: 'questioning_discussion', label: 'Questioning and discussion' },
      { value: 'explaining_clearly', label: 'Explaining a tough concept' },
      { value: 'misconceptions', label: 'A misconception in the room' },
      { value: 'feedback_and_grading', label: 'Feedback and grading' },
      { value: 'checking_understanding', label: 'Checking for understanding' },
      { value: 'pacing_chunking', label: 'Pacing and time' },
    ],
  },
  {
    value: 'classroom_management',
    label: 'Classroom Management',
    shortLabel: 'Classroom',
    blurb: 'Behavior, routines, and getting the room with you.',
    kinds: [
      { value: 'disengagement', label: 'Engagement and participation' },
      { value: 'defiance', label: 'Behavior in the moment' },
      { value: 'transitions', label: 'Routines and transitions' },
      { value: 'technology_misuse', label: 'Phones and devices' },
      { value: 'group_work_breakdown', label: 'Group work breaking down' },
    ],
  },
  {
    value: 'student_concern',
    label: "A student I'm worried about",
    shortLabel: 'A student',
    blurb: 'Noticing, writing it down, and working out who else needs to know.',
    kinds: [
      { value: 'student_check_in', label: 'The check-in' },
      { value: 'looping_in_counselor', label: 'Looping in the counselor' },
      { value: 'call_home', label: 'The call home' },
      { value: 'documenting_concern', label: "Writing down what you're seeing" },
    ],
  },
  {
    value: 'parent_communication',
    label: 'Parent Communication',
    shortLabel: 'Parents',
    blurb: 'Hard emails, conferences, and hard news — said well.',
    kinds: [
      { value: 'delivering_hard_news', label: 'Delivering hard news' },
      { value: 'difficult_parent_email', label: 'Angry or accusatory' },
      { value: 'grade_dispute', label: 'Grade dispute' },
      { value: 'attendance', label: 'Attendance' },
      { value: 'parent_boundary', label: 'Setting a boundary' },
    ],
  },
  {
    value: 'professionalism',
    label: 'Professionalism',
    shortLabel: 'Professional',
    blurb: 'Co-teachers, admin, team time, paperwork, and growing as a teacher.',
    kinds: [
      { value: 'talking_with_admin', label: 'Talking with admin' },
      { value: 'co_teaching', label: 'Co-teacher friction' },
      { value: 'disagreeing_with_a_peer', label: 'Department disagreement' },
      { value: 'post_observation', label: 'Post-observation' },
    ],
  },
  {
    value: 'self_and_job',
    label: 'Me and this job',
    shortLabel: 'Me',
    blurb: 'Workload, boundaries, and whether this is sustainable.',
    kinds: [
      { value: 'saying_no', label: 'Saying no' },
      { value: 'asking_for_help', label: 'Asking for help' },
      { value: 'self_boundary', label: 'Setting a boundary' },
      { value: 'workload_concern', label: 'Raising a workload concern' },
    ],
  },
  {
    value: 'something_else',
    label: 'Something else',
    shortLabel: 'Something else',
    blurb: "Not sure which of these it is — start anywhere and I'll follow.",
    ghost: true,
    // Practice offers only "Describe my own" here, by design.
    kinds: [],
  },
]

export const TOPIC_VALUES: readonly string[] = TOPICS.map((t) => t.value)

export const ALL_KINDS: readonly string[] = TOPICS.flatMap((t) => t.kinds.map((k) => k.value))

/// Sub-categories that were once offered and no longer are, kept so a stored
/// row can still be NAMED in history, exports and admin breakdowns. The
/// pickers never show these; nothing was deleted from the database for it.
/// Mirrors RETIRED_KIND_LABELS / RETIRED_KIND_TOPICS on the server.
export const RETIRED_KINDS: Record<string, { label: string; topic: string }> = {
  reaching_every_level: { label: 'Reaching every level', topic: 'teaching_and_learning' },
  content_sequencing: { label: 'Planning & sequencing', topic: 'teaching_and_learning' },
  peer_conflict: { label: 'Conflict & repair', topic: 'classroom_management' },
  disruption: { label: 'Interruptions & redirection', topic: 'classroom_management' },
  conferences: { label: 'Conferences', topic: 'parent_communication' },
  building_partnership: { label: 'Building a partnership', topic: 'parent_communication' },
  team_and_plc_time: { label: 'Team & PLC time', topic: 'professionalism' },
  mentoring: { label: 'Mentoring & growth', topic: 'professionalism' },
  records_and_deadlines: { label: 'Records & deadlines', topic: 'professionalism' },
}

export function findTopic(value: string | null | undefined): Topic | undefined {
  if (!value) return undefined
  return TOPICS.find((t) => t.value === value)
}

export function topicLabel(value: string | null | undefined): string | null {
  return findTopic(value)?.label ?? null
}

/// The topic a kind belongs to, offered or retired. Kind values are unique
/// across every topic and the retired set, which is what lets a single
/// `category` column identify its own topic with no join.
export function topicForKind(kind: string | null | undefined): Topic | undefined {
  if (!kind) return undefined
  const offered = TOPICS.find((t) => t.kinds.some((k) => k.value === kind))
  if (offered) return offered
  return findTopic(RETIRED_KINDS[kind]?.topic)
}

/// A human label for any stored kind, offered or retired. Falls back to the
/// raw value rather than an empty string, so an unrecognized row renders as
/// something a teacher can at least report.
export function kindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null
  if (kind === DESCRIBE_MY_OWN) return 'My own situation'
  for (const topic of TOPICS) {
    const match = topic.kinds.find((k) => k.value === kind)
    if (match) return match.label
  }
  return RETIRED_KINDS[kind]?.label ?? kind
}

/// Kinds to offer for a topic. No topic selected means there is nothing to
/// scope the row to, so nothing is offered — Practice shows only
/// "Describe my own" until a topic is chosen.
export function kindsFor(topic: string | null | undefined): TopicKind[] {
  return findTopic(topic)?.kinds ?? []
}

/// Whether this topic asks about subject, course and what is being taught
/// right now. Only Teaching and Learning does — a parent email does not get
/// better for knowing it came from an honors section.
export function asksContentFields(topic: string | null | undefined): boolean {
  return topic === TEACHING_AND_LEARNING
}

// --- difficulty ---
//
// Mirrors DIFFICULTY_LEVELS / harderDifficulty / hasHarderDifficulty in
// server/src/lib/scenarioCategories.ts. Needed here for the "run it one notch
// harder" offer, which decides the next scenario's difficulty client-side.

export const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export type Difficulty = (typeof DIFFICULTY_LEVELS)[number]

/// One notch harder. Advanced is the ceiling and stays there rather than
/// wrapping around to beginner, which would read as the app losing track of
/// where the teacher is.
export function harderDifficulty(current: string | null | undefined): Difficulty {
  const index = DIFFICULTY_LEVELS.indexOf(current as Difficulty)
  if (index < 0) return 'intermediate'
  return DIFFICULTY_LEVELS[Math.min(index + 1, DIFFICULTY_LEVELS.length - 1)]
}

/// Whether there is a harder notch left to offer.
export function hasHarderDifficulty(current: string | null | undefined): boolean {
  return current !== 'advanced' && DIFFICULTY_LEVELS.includes(current as Difficulty)
}
