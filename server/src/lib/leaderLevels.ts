// Leader's Corner levels. A superadmin assigns one per person from the
// platform roster (User.leaderLevel); it is never self-chosen and never read
// from jobTitle. The level decides two things: which scenarios the person can
// open at all, and what the coach assumes they can and cannot promise — a
// vice principal cannot move a child to another teacher, and a superintendent
// should not be coached to take a single parent complaint on personally.

export type LeaderLevel = 'district' | 'building' | 'assistant' | 'teacher_leader'

export type LeaderLevelInfo = {
  value: LeaderLevel
  label: string
  // Who usually holds it, for the roster dropdown and the page header.
  titles: string
  // What this person can actually decide or commit to.
  canPromise: string
  // What is above them, and who they bring in.
  handOff: string
}

export const LEADER_LEVELS: readonly LeaderLevelInfo[] = [
  {
    value: 'district',
    label: 'District',
    titles: 'District Leader',
    canPromise: 'district policy, budget priorities, hiring and district-wide communication',
    handOff:
      'the school board for decisions that are the board’s, and district legal counsel for anything with legal exposure; a single family’s complaint belongs with the principal first',
  },
  {
    value: 'building',
    label: 'Building',
    titles: 'Principal',
    canPromise: 'staffing and schedules inside the building, school-wide decisions, and the school’s own follow-up',
    handOff: 'the superintendent or district office for policy, budget or anything district-wide, and HR for personnel actions',
  },
  {
    value: 'assistant',
    label: 'Assistant',
    titles: 'Assistant Principal, Vice Principal, Dean of Students, Dean of Academics',
    canPromise:
      'decisions within school policy in their own areas — discipline within the code of conduct, academic interventions and the grade-appeal process — student support plans, and their own follow-up with families and staff',
    handOff: 'the principal for staffing, placement changes, exceptions to policy, or anything outside the code of conduct',
  },
  {
    value: 'teacher_leader',
    label: 'Teacher-leader',
    titles: 'Curriculum Supervisor, Department Head, Instructional Coach',
    canPromise: 'feedback, coaching, modeling, and the decisions a team has agreed to make together — not discipline',
    handOff: 'the principal or assistant principal for discipline, staffing, or anything else that needs formal authority',
  },
]

export function findLeaderLevel(value: unknown): LeaderLevelInfo | null {
  return LEADER_LEVELS.find((l) => l.value === value) ?? null
}

export function isLeaderLevel(value: unknown): value is LeaderLevel {
  return findLeaderLevel(value) !== null
}

// What a leader is responsible for, separate from how much authority they
// have: titles mean different jobs at different schools (one school's vice
// principal does both; another splits it between a Dean of Students and a
// Dean of Academics), so a superadmin ticks the areas instead of us guessing
// from a title.
export type LeaderArea = 'student_life' | 'academics'

export const LEADER_AREAS: readonly { value: LeaderArea; label: string }[] = [
  { value: 'student_life', label: 'Student life & discipline' },
  { value: 'academics', label: 'Academics & instruction' },
]

export function isLeaderArea(value: unknown): value is LeaderArea {
  return LEADER_AREAS.some((a) => a.value === value)
}

// Principals and district leaders hold every area and evaluate staff; their
// stored areas and evaluates flag are never read.
export function coversEverything(level: LeaderLevel): boolean {
  return level === 'district' || level === 'building'
}

export type LeaderProfile = {
  level: LeaderLevelInfo
  areas: LeaderArea[]
  evaluates: boolean
}

// The person as Leader's Corner treats them. No areas stored means every
// area: an account given a level before areas existed keeps every scenario
// it had, rather than losing them on deploy.
export function leaderProfile(
  user: { leaderLevel: string | null; leaderAreas: string[]; leaderEvaluates: boolean } | null,
): LeaderProfile | null {
  const level = findLeaderLevel(user?.leaderLevel)
  if (!level || !user) return null
  if (coversEverything(level.value)) return { level, areas: LEADER_AREAS.map((a) => a.value), evaluates: true }
  const stored = user.leaderAreas.filter(isLeaderArea)
  return { level, areas: stored.length ? stored : LEADER_AREAS.map((a) => a.value), evaluates: user.leaderEvaluates }
}
