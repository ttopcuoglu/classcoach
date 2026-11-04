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
    titles: 'Superintendent, District Leader',
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
    titles: 'Assistant Principal, Vice Principal',
    canPromise: 'discipline outcomes within the code of conduct, student support plans, and their own follow-up with families and staff',
    handOff: 'the principal for staffing, placement changes, or anything outside the code of conduct',
  },
  {
    value: 'teacher_leader',
    label: 'Teacher-leader',
    titles: 'Supervisor, Department Head, Instructional Coach',
    canPromise: 'feedback, coaching, modeling, and the decisions a team has agreed to make together — not evaluation or discipline',
    handOff: 'the principal or assistant principal for evaluation, discipline, or anything that needs formal authority',
  },
]

export function findLeaderLevel(value: unknown): LeaderLevelInfo | null {
  return LEADER_LEVELS.find((l) => l.value === value) ?? null
}

export function isLeaderLevel(value: unknown): value is LeaderLevel {
  return findLeaderLevel(value) !== null
}
