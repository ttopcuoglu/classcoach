// Builds a demo school for showing Wivoza to principals: Maple Ridge
// Academy (grades 6-12, 24 licensed teachers), a principal account, and six
// weeks of staff activity arranged so every admin report has something true
// to say — adoption growing, a clear shared need, a focus area the principal
// started tracking on Sep 1, and lessons since then showing it improve.
//
//   npx tsx --env-file=.env src/scripts/seedAdminDemo.ts plan
//   npx tsx --env-file=.env src/scripts/seedAdminDemo.ts insert <principal-email> <demo-teacher-email>
//
// plan builds everything in memory and prints what the dashboard will show;
// only insert touches the database. Both use the same seeded randomness, so
// insert writes exactly what plan printed.
//
// The 23 other teachers can't be signed into (no password, and a reserved
// .example domain), and admins never see transcripts or coaching content —
// so their lessons are built from phrase-bank classroom talk instead of
// written transcripts. Every number still comes from the real analyzer
// (analyzeTranscript / detectLessonContent) and the real priority rules.

import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { analyzeTranscript, detectLessonContent, type Segment } from '../lib/audioAnalysis.ts'
import { topPriorityForSession } from '../lib/coachingPriority.ts'

const SCHOOL_NAME = 'Maple Ridge Academy'
const JOIN_CODE = 'MAPLE612'
const TEACHER_DOMAIN = 'mapleridge.example'
// Reports compare to "now"; the story is laid out relative to this date.
const TODAY = new Date('2026-09-18T20:00:00Z')
const FOCUS_STARTED = new Date('2026-09-01T11:30:00Z') // Sep 1, 7:30am ET
const SCHOOL_STARTED = new Date('2026-08-17T12:00:00Z')
// Accounts went out at the Aug 11 kickoff; nobody used Wivoza before that.
const PILOT_OPENED = new Date('2026-08-11T13:00:00Z')
const WORDS_PER_SEC = 2.4
const DAY = 24 * 60 * 60 * 1000

// ---- seeded randomness ----

function seeded(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const rand = seeded('maple-ridge-academy')
const between = (lo: number, hi: number) => lo + (hi - lo) * rand()
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1))
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]
const chance = (p: number) => rand() < p

// ---- the staff ----

type Subject = 'Math' | 'Science' | 'English' | 'History' | 'Spanish' | 'Art' | 'Music'

type Teacher = {
  first: string
  last: string
  grade: number
  subject: Subject
  // 0 = never activated. Otherwise the trailing week (6 = oldest, 1 = this
  // week) they started, the last week they were active, and weeks skipped.
  startWeek: number
  lastWeek: number
  skipWeeks: number[]
  focusMetric: string | null
}

// Weekly active teachers come out 3 → 8 → 11 → 13 → 15 → 17 with the demo
// teacher, 13 returning this week, two who drifted off (Inactive on the
// roster) and three who never activated.
const TEACHERS: Teacher[] = [
  { first: 'Elena', last: 'Vasquez', grade: 7, subject: 'Math', startWeek: 6, lastWeek: 1, skipWeeks: [], focusMetric: 'higherOrderPct' },
  { first: 'Marcus', last: 'Bell', grade: 10, subject: 'English', startWeek: 6, lastWeek: 1, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Priya', last: 'Nair', grade: 8, subject: 'Science', startWeek: 6, lastWeek: 2, skipWeeks: [], focusMetric: 'avgWaitTime' },
  { first: 'David', last: 'Okafor', grade: 11, subject: 'History', startWeek: 5, lastWeek: 1, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Hannah', last: 'Kim', grade: 6, subject: 'English', startWeek: 5, lastWeek: 1, skipWeeks: [], focusMetric: 'cfuCount' },
  { first: 'Luis', last: 'Romero', grade: 9, subject: 'Math', startWeek: 5, lastWeek: 1, skipWeeks: [], focusMetric: 'higherOrderPct' },
  { first: 'Grace', last: 'Thompson', grade: 7, subject: 'History', startWeek: 4, lastWeek: 1, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Omar', last: 'Haddad', grade: 12, subject: 'Science', startWeek: 4, lastWeek: 1, skipWeeks: [], focusMetric: 'avgWaitTime' },
  { first: 'Rachel', last: 'Stein', grade: 8, subject: 'English', startWeek: 3, lastWeek: 2, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Tyler', last: 'Brooks', grade: 6, subject: 'Math', startWeek: 3, lastWeek: 1, skipWeeks: [], focusMetric: 'redirectionCount' },
  { first: 'Mei', last: 'Chen', grade: 10, subject: 'Science', startWeek: 2, lastWeek: 1, skipWeeks: [], focusMetric: 'higherOrderPct' },
  { first: 'Jamal', last: 'Wright', grade: 8, subject: 'History', startWeek: 2, lastWeek: 1, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Sofia', last: 'Martinez', grade: 9, subject: 'Spanish', startWeek: 2, lastWeek: 1, skipWeeks: [], focusMetric: 'cfuCount' },
  { first: 'Nathan', last: 'Park', grade: 11, subject: 'Math', startWeek: 2, lastWeek: 1, skipWeeks: [], focusMetric: 'higherOrderPct' },
  { first: 'Aisha', last: 'Johnson', grade: 7, subject: 'Science', startWeek: 1, lastWeek: 1, skipWeeks: [], focusMetric: 'avgWaitTime' },
  { first: 'Ben', last: 'Carter', grade: 12, subject: 'English', startWeek: 1, lastWeek: 1, skipWeeks: [], focusMetric: 'talkRatio' },
  { first: 'Lucia', last: 'Ferreira', grade: 6, subject: 'Art', startWeek: 1, lastWeek: 1, skipWeeks: [], focusMetric: 'redirectionCount' },
  { first: 'Kevin', last: "O'Brien", grade: 10, subject: 'History', startWeek: 1, lastWeek: 1, skipWeeks: [], focusMetric: null },
  // Drifted off after the first weeks — "Inactive" on the roster.
  { first: 'Diane', last: 'Walsh', grade: 8, subject: 'Math', startWeek: 5, lastWeek: 3, skipWeeks: [], focusMetric: null },
  { first: 'Chris', last: 'Morgan', grade: 9, subject: 'Music', startWeek: 4, lastWeek: 3, skipWeeks: [], focusMetric: null },
  // Never activated.
  { first: 'Patricia', last: 'Lee', grade: 11, subject: 'Science', startWeek: 0, lastWeek: 0, skipWeeks: [], focusMetric: null },
  { first: 'Samuel', last: 'Adeyemi', grade: 7, subject: 'English', startWeek: 0, lastWeek: 0, skipWeeks: [], focusMetric: null },
  { first: 'Rosa', last: 'Delgado', grade: 12, subject: 'Spanish', startWeek: 0, lastWeek: 0, skipWeeks: [], focusMetric: null },
]

const CLASS_NAME: Record<Subject, (grade: number) => string> = {
  Math: (g) => (g >= 9 ? (g >= 11 ? 'Algebra II' : 'Algebra I') : `Math ${g}`),
  Science: (g) => (g >= 10 ? (g >= 12 ? 'Physics' : 'Chemistry') : `Science ${g}`),
  English: (g) => `English ${g}`,
  History: (g) => (g >= 9 ? (g >= 11 ? 'US History' : 'World History') : `Social Studies ${g}`),
  Spanish: () => 'Spanish I',
  Art: (g) => `Art ${g}`,
  Music: () => 'Music',
}
const isStem = (s: Subject) => s === 'Math' || s === 'Science'
const isMiddle = (g: number) => g <= 8

// Trailing 7-day windows ending TODAY, the way the weekly chart counts them.
function weekWindow(week: number): { from: Date; to: Date } {
  const to = new Date(TODAY.getTime() - (week - 1) * 7 * DAY)
  return { from: new Date(to.getTime() - 7 * DAY), to }
}
function activeWeeks(t: Teacher): number[] {
  if (t.startWeek === 0) return []
  const weeks: number[] = []
  for (let w = t.startWeek; w >= t.lastWeek; w--) if (!t.skipWeeks.includes(w)) weeks.push(w)
  return weeks
}

// A school-day moment inside a window: weekdays, `fromHour`-`toHour` ET.
function momentIn(win: { from: Date; to: Date }, fromHourEt: number, toHourEt: number, notBefore?: Date): Date {
  for (let attempt = 0; attempt < 200; attempt++) {
    const day = new Date(win.from.getTime() + Math.floor(rand() * 7) * DAY)
    const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), fromHourEt + 4, 0))
    d.setUTCMinutes(Math.floor(between(0, (toHourEt - fromHourEt) * 60)))
    const weekday = d.getUTCDay()
    if (weekday === 0 || weekday === 6) continue
    if (d < win.from || d >= win.to || d >= TODAY) continue
    if (d < (notBefore ?? PILOT_OPENED)) continue
    return d
  }
  return new Date(Math.min(win.to.getTime(), TODAY.getTime()) - 3 * 60 * 60 * 1000)
}

// ---- lesson transcripts from phrase banks ----

const TERMS: Record<Subject, string[]> = {
  Math: ['slope', 'the ratio', 'the equation', 'the variable', 'the y-intercept', 'a proportional relationship', 'the unit rate', 'the function'],
  Science: ['density', 'the energy transfer', 'the reaction', 'the variable we changed', 'the data', 'the ecosystem', 'the force', 'the cell membrane'],
  English: ['the theme', 'the narrator', "the author's choice", 'the evidence', 'the conflict', 'the character', 'the claim', 'the tone'],
  History: ['the primary source', 'the treaty', 'the revolution', 'the trade route', 'the government', 'the cause', 'the evidence', 'the empire'],
  Spanish: ['the verb', 'the conjugation', 'the sentence', 'the vocabulary word', 'the pronoun', 'the tense', 'the phrase', 'the ending'],
  Art: ['the color wheel', 'the composition', 'contrast', 'the sketch', 'the texture', 'the perspective', 'the palette', 'balance'],
  Music: ['the rhythm', 'the tempo', 'the melody', 'the measure', 'the dynamics', 'the harmony', 'the scale', 'the time signature'],
}

const EXPLAIN = [
  'So the way I want you to think about {t} is as a relationship, not just a rule you memorize.',
  'If you look at the example on the board, {t} shows up right here, and that is the piece people usually skip.',
  'Last year a lot of students mixed up {t} with the step before it, so let us slow down on this part.',
  'We are going to use {t} again on Friday, so make sure the notes you take here are notes you can actually use.',
  'Notice how {t} changes when we change one thing and keep everything else the same.',
  'The reason {t} matters is that it connects what we did yesterday to what we are doing next week.',
  'I am going to walk through one more example with {t} and then you will try one.',
  'When you see {t} on the assessment, the first thing I want you to do is write down what it tells you.',
]
const RECALL_Q = ['What is {t}?', 'What does {t} tell us here?', 'How many parts does {t} have?', 'What are the two pieces of {t}?', 'Name the step that comes before {t}.']
const HIGHER_Q = [
  'Why do you think {t} works that way?',
  'How would {t} change if we doubled the first number?',
  'What would happen if we left out {t}?',
  'What evidence do you have that {t} is right here?',
  'How could we check {t} without redoing the whole problem?',
  'Explain why {t} matters for the answer.',
  'Compare {t} to what we did yesterday.',
]
const SHORT_ANSWER = ['{t}?', "It's {t}.", 'The first one?', 'Um, {t}.', 'Two.', 'Is it {t}?']
const LONG_ANSWER = [
  'I think {t} works because when one part goes up the other part has to change too, so they stay connected.',
  'We checked {t} by looking at the example first, and it matched what we got when we tried a second way.',
  'If you left out {t} the answer would still look right but it would not actually make sense with the rest.',
  'My partner said {t} was the key part, and I agree because everything else depends on it.',
  'I noticed {t} was different in the second example, so we compared them and found the pattern.',
]
const GENERIC_FEEDBACK = ['Good job.', 'Nice work.', 'Right.', 'Okay, good.', 'Yes.']
const SPECIFIC_FEEDBACK = [
  'I like how you connected {t} to the example, that is exactly the reasoning I want.',
  'Nice thinking, you explained why {t} matters instead of just naming it.',
  'Good, and notice you used evidence from the problem to back that up.',
  'That is a strong point, especially the part about how {t} changes.',
]
const CFU = [
  'Thumbs up if you are ready to try one on your own.',
  'Turn and talk with your partner about {t} for thirty seconds.',
  'On a scale of one to five, how confident are you with {t}?',
  'Before you leave, write one sentence about {t} on your exit ticket.',
]
const REDIRECT = ['Eyes up here, please.', 'I need everyone with me for this part.', 'Quiet please, we are almost there.', 'Voices off for a second.', 'Focus up, this is the important part.']
const DIRECTIVE = ['Open your notebooks to a new page.', 'Write down the example we just did.', 'Work with your partner on the next two.', "When you're done, raise your hand.", 'Turn to page forty in your packet.']
const NAMES = ['Maya', 'Jordan', 'Ethan', 'Aaliyah', 'Noah', 'Sofia', 'Marcus', 'Ava', 'Diego', 'Leah']

const fill = (s: string, subject: Subject) => s.replaceAll('{t}', pick(TERMS[subject]))

type Profile = 'lecture' | 'recall' | 'short_wait' | 'no_cfu' | 'balanced'

type ProfileSpec = {
  explainLines: [number, number]
  explainSentences: [number, number]
  questions: [number, number]
  higherOrder: number
  longAnswer: number
  wait: [number, number]
  specificFeedback: number
  cfus: [number, number]
  workGaps: [number, number]
}

const PROFILES: Record<Profile, ProfileSpec> = {
  // Teacher talks 65%+ of the lesson.
  lecture: { explainLines: [2, 3], explainSentences: [4, 6], questions: [10, 13], higherOrder: 0.45, longAnswer: 0.15, wait: [1.6, 3.2], specificFeedback: 0.6, cfus: [1, 2], workGaps: [0, 1] },
  // Plenty of questions, mostly recall.
  recall: { explainLines: [1, 1], explainSentences: [2, 3], questions: [14, 18], higherOrder: 0.2, longAnswer: 0.3, wait: [2.8, 4], specificFeedback: 0.6, cfus: [1, 2], workGaps: [1, 2] },
  short_wait: { explainLines: [1, 1], explainSentences: [2, 3], questions: [12, 15], higherOrder: 0.5, longAnswer: 0.45, wait: [0.6, 1.8], specificFeedback: 0.6, cfus: [1, 2], workGaps: [1, 2] },
  no_cfu: { explainLines: [1, 1], explainSentences: [2, 3], questions: [11, 14], higherOrder: 0.5, longAnswer: 0.5, wait: [3, 4.2], specificFeedback: 0.65, cfus: [0, 0], workGaps: [2, 3] },
  balanced: { explainLines: [1, 1], explainSentences: [1, 3], questions: [11, 15], higherOrder: 0.55, longAnswer: 0.7, wait: [3.1, 4.6], specificFeedback: 0.7, cfus: [2, 4], workGaps: [2, 3] },
}

type Line = { teacher: boolean; text: string; gapAfter?: number }

function buildLesson(subject: Subject, grade: number, profile: Profile): Segment[] {
  const spec = PROFILES[profile]
  const lines: Line[] = []
  const say = (text: string, gapAfter?: number) => lines.push({ teacher: true, text, gapAfter })
  const student = (text: string) => lines.push({ teacher: false, text })
  const explain = () => {
    const n = int(...spec.explainSentences)
    say(Array.from({ length: n }, () => fill(pick(EXPLAIN), subject)).join(' '))
  }

  say(`Okay everyone, today we're going to work on ${pick(TERMS[subject])}.`)
  if (chance(0.7)) say(`Think about a time when you used ${pick(TERMS[subject])} without even noticing, in real life.`)
  if (chance(0.6)) say(`The key term today is ${pick(TERMS[subject])}, and in other words, it is the part that connects everything else.`)

  const questions = int(...spec.questions)
  const cfus = int(...spec.cfus)
  const workGaps = int(...spec.workGaps)
  // Middle school rooms need more redirecting, and lecture-heavy or rushed
  // lessons more than the rest.
  const redirections = isMiddle(grade)
    ? profile === 'balanced'
      ? int(0, 2)
      : int(2, 5)
    : profile === 'lecture'
      ? int(0, 2)
      : int(0, 1)
  const directives = int(1, 3)
  const cfuAt = new Set(Array.from({ length: cfus }, () => int(1, questions)))
  const redirectAt = new Set(Array.from({ length: redirections }, () => int(1, questions)))
  const workAt = new Set(Array.from({ length: workGaps }, () => int(2, questions)))
  const directiveAt = new Set(Array.from({ length: directives }, () => int(1, questions)))

  for (let q = 1; q <= questions; q++) {
    for (let e = int(...spec.explainLines); e > 0; e--) explain()
    if (redirectAt.has(q)) say(pick(REDIRECT))
    if (directiveAt.has(q)) say(pick(DIRECTIVE), workAt.has(q) ? between(60, 150) : undefined)
    else if (workAt.has(q)) say(pick(DIRECTIVE), between(60, 150))
    // STEM rooms lean on recall questions whatever the lesson's shape — the
    // subject gap the breakdown is there to surface.
    const higher = chance(Math.min(0.85, spec.higherOrder * (isStem(subject) ? 0.55 : 1.15)))
    const name = chance(0.4) ? `${pick(NAMES)}, ` : ''
    say(`${name}${fill(pick(higher ? HIGHER_Q : RECALL_Q), subject)}`)
    student(fill(pick(chance(spec.longAnswer) ? LONG_ANSWER : SHORT_ANSWER), subject))
    if (chance(0.3)) {
      say(fill(pick(HIGHER_Q), subject))
      student(fill(pick(LONG_ANSWER), subject))
    }
    say(fill(pick(chance(spec.specificFeedback) ? SPECIFIC_FEEDBACK : GENERIC_FEEDBACK), subject))
    if (cfuAt.has(q)) say(fill(pick(CFU), subject), between(20, 40))
  }
  if (profile !== 'lecture' && chance(0.5)) say(fill(CFU[3], subject))
  say('Okay, next time we will pick up right here.')

  // Speaking time from word count; the silence after a question the student
  // answers is the lesson's wait time.
  const segments: Segment[] = []
  let t = between(1, 3)
  lines.forEach((line, i) => {
    const words = line.text.split(/\s+/).length
    const duration = Math.max(0.8, words / WORDS_PER_SEC) * between(0.92, 1.1)
    segments.push({ speakerLabel: line.teacher ? 'Teacher' : 'Student', startSec: round(t), endSec: round(t + duration), text: line.text })
    t += duration
    const next = lines[i + 1]
    if (!next) return
    if (line.teacher && !next.teacher && line.text.trim().endsWith('?')) t += between(...spec.wait)
    else if (line.gapAfter && next.teacher) t += line.gapAfter
    else t += between(0.4, 1.2)
  })
  return segments
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

// Before the principal's Sep 1 focus area, about half of lessons ran long on
// teacher talk; after it, closer to one in five. STEM classes lean on recall
// questions the whole time — the next need the data points to.
function profileFor(subject: Subject, when: Date): Profile {
  const before = when < FOCUS_STARTED
  const roll = rand()
  if (before) {
    if (roll < 0.5) return 'lecture'
    if (roll < 0.66) return isStem(subject) ? 'recall' : 'short_wait'
    if (roll < 0.78) return 'short_wait'
    if (roll < 0.84) return 'no_cfu'
    return 'balanced'
  }
  if (roll < 0.2) return 'lecture'
  if (roll < 0.4) return isStem(subject) ? 'recall' : 'balanced'
  if (roll < 0.48) return 'short_wait'
  if (roll < 0.52) return 'no_cfu'
  return 'balanced'
}

// ---- the rest of a teacher's week ----

const ASK_BY_CATEGORY: Record<string, string[]> = {
  disruption: ['Side conversations keep taking over my class during notes.', 'A group in the back keeps making noises during instruction.'],
  defiance: ['A student refused to move seats today and it turned into a standoff.', 'A student told me the rules are stupid and walked out of line.'],
  peer_conflict: ['Two students keep making comments about each other during group work.', 'An argument from lunch carried into my class again.'],
  disengagement: ['Half my class puts their heads down during independent work.', 'A student has stopped turning in anything since the first week.'],
  technology_misuse: ['Students keep switching tabs to games during the Chromebook assignment.', 'Phones keep coming out during tests.'],
  transitions: ['It takes ten minutes to settle after we come back from lunch.', 'Moving into groups turns into chaos every time.'],
}
const MS_CATEGORIES = ['disruption', 'disruption', 'defiance', 'peer_conflict', 'transitions', 'disruption']
const HS_CATEGORIES = ['disengagement', 'technology_misuse', 'disengagement', 'transitions', 'defiance']
const MESSAGE_PURPOSES = ['behavior_concern', 'behavior_concern', 'behavior_concern', 'positive_update', 'positive_update', 'academic_concern', 'academic_concern', 'attendance_concern', 'meeting_request']
const PREP_CATEGORIES = ['behavior_concern', 'behavior_concern', 'angry_accusatory', 'angry_accusatory', 'grade_dispute', 'unmotivated_student']

type Activity =
  | { kind: 'lesson'; at: Date; profile: Profile; segments: Segment[] }
  | { kind: 'ask'; at: Date; category: string; text: string }
  | { kind: 'talk'; at: Date; text: string }
  | { kind: 'practice'; at: Date; category: string; rating: number }
  | { kind: 'message'; at: Date; purpose: string }
  | { kind: 'prep'; at: Date; category: string; rating: number }
  | { kind: 'lesson_plan'; at: Date; objective: string }

type PlannedTeacher = Teacher & { email: string; activities: Activity[]; onboardedAt: Date | null; createdAt: Date }

function planTeacher(t: Teacher): PlannedTeacher {
  const email = `${t.first}.${t.last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${TEACHER_DOMAIN}`
  const weeks = activeWeeks(t)
  const activities: Activity[] = []
  const middle = isMiddle(t.grade)

  for (const week of weeks) {
    const win = weekWindow(week)
    // Lessons only once school is in session, a little more often as the
    // teacher settles in.
    const schoolWin = { from: new Date(Math.max(win.from.getTime(), SCHOOL_STARTED.getTime())), to: win.to }
    if (schoolWin.from < schoolWin.to) {
      const early = schoolWin.from < FOCUS_STARTED
      const lessons = chance(early ? 0.9 : 0.8) ? (chance(early ? 0.45 : 0.25) ? 2 : 1) : 0
      for (let i = 0; i < lessons; i++) {
        const at = momentIn(schoolWin, 8, 14)
        const profile = profileFor(t.subject, at)
        activities.push({ kind: 'lesson', at, profile, segments: buildLesson(t.subject, t.grade, profile) })
      }
    }
    // Practice ratings rise over the weeks — the staff-wide growth signal.
    const strongChance = week >= 3 ? 0.4 : week === 2 ? 0.5 : 0.7
    const extras = int(1, 3)
    for (let i = 0; i < extras; i++) {
      const at = momentIn(win, 15, 21)
      const roll = rand()
      if (roll < 0.28) {
        const category = pick(middle ? MS_CATEGORIES : HS_CATEGORIES)
        activities.push({ kind: 'ask', at, category, text: pick(ASK_BY_CATEGORY[category]) })
      } else if (roll < 0.43) {
        activities.push({ kind: 'talk', at, text: pick(['Honestly this week has been a lot.', 'My last period has been really hard to get going.', 'I want to talk through a student who shut down today.']) })
      } else if (roll < 0.66) {
        activities.push({ kind: 'practice', at, category: pick(middle ? MS_CATEGORIES : HS_CATEGORIES), rating: chance(strongChance) ? int(4, 5) : int(2, 3) })
      } else if (roll < 0.8) {
        activities.push({ kind: 'message', at, purpose: pick(MESSAGE_PURPOSES) })
      } else if (roll < 0.9) {
        activities.push({ kind: 'prep', at, category: pick(PREP_CATEGORIES), rating: chance(strongChance) ? int(4, 5) : int(2, 3) })
      } else {
        activities.push({ kind: 'lesson_plan', at, objective: `Students will be able to explain ${pick(TERMS[t.subject])} using evidence from ${pick(['the example', 'the text', 'their data', 'the source'])}.` })
      }
    }
  }
  activities.sort((a, b) => a.at.getTime() - b.at.getTime())
  const firstActivity = activities[0]?.at ?? null
  const onboardedAt = firstActivity ? new Date(firstActivity.getTime() - between(20, 90) * 60 * 1000) : null
  // Everyone was invited at the Aug 11 kickoff.
  const createdAt = new Date(Math.min((onboardedAt ?? TODAY).getTime(), PILOT_OPENED.getTime() + between(0, 3) * DAY))
  return { ...t, email, activities, onboardedAt, createdAt }
}

// ---- plan: print what the dashboard will show ----

function summarize(staff: PlannedTeacher[]) {
  const lessons = staff.flatMap((t) =>
    t.activities.filter((a): a is Extract<Activity, { kind: 'lesson' }> => a.kind === 'lesson').map((a) => ({ t, a, analysis: analyzeTranscript(a.segments) })),
  )
  const priority = (x: (typeof lessons)[number]) =>
    topPriorityForSession({ ...x.analysis, durationSec: Math.round(x.a.segments[x.a.segments.length - 1].endSec), metricsDetail: x.analysis.metricsDetail })
  const share = (list: typeof lessons, theme: string) => {
    const hits = list.filter((x) => priority(x) === theme).length
    return `${list.length ? Math.round((hits / list.length) * 100) : 0}% (${hits}/${list.length})`
  }
  const before = lessons.filter((x) => x.a.at < FOCUS_STARTED)
  const after = lessons.filter((x) => x.a.at >= FOCUS_STARTED)

  console.log(`Staff: ${staff.length} synthetic teachers (+ the demo teacher = ${staff.length + 1} licensed)`)
  console.log(`Activated: ${staff.filter((t) => t.onboardedAt).length} (+ demo teacher)`)
  for (let w = 6; w >= 1; w--) {
    const win = weekWindow(w)
    const active = staff.filter((t) => t.activities.some((a) => a.at >= win.from && a.at < win.to)).length
    console.log(`  week ending ${win.to.toISOString().slice(0, 10)}: ${active} active (+ demo teacher from Aug 21)`)
  }
  console.log(`\nLessons: ${lessons.length} (${before.length} before Sep 1, ${after.length} since)`)
  const tally: Record<string, number> = {}
  for (const x of lessons) {
    const p = priority(x)
    if (p) tally[p] = (tally[p] ?? 0) + 1
  }
  console.log('All-time needs:', tally)
  console.log(`Talk balance: before Sep 1 ${share(before, 'talk-balance')} → since ${share(after, 'talk-balance')}`)

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN)
  const pct = (list: typeof lessons, f: (x: (typeof lessons)[number]) => number) => avg(list.map(f)).toFixed(1)
  const stem = lessons.filter((x) => isStem(x.t.subject))
  const hum = lessons.filter((x) => x.t.subject === 'English' || x.t.subject === 'History')
  const ho = (list: typeof lessons) => {
    const q = list.reduce((s, x) => s + x.analysis.questionCount, 0)
    const h = list.reduce((s, x) => s + x.analysis.metricsDetail.higherOrderQuestionCount, 0)
    return `${Math.round((h / q) * 100)}%`
  }
  console.log(`Higher-order questions: STEM ${ho(stem)} vs humanities ${ho(hum)}`)
  const ms = lessons.filter((x) => isMiddle(x.t.grade))
  const hs = lessons.filter((x) => !isMiddle(x.t.grade))
  const perTen = (x: (typeof lessons)[number]) => x.analysis.metricsDetail.redirectionCount / (x.analysis.metricsDetail.totalDurationSec / 600)
  console.log(`Redirections per 10 min: middle ${pct(ms, perTen)} vs high ${pct(hs, perTen)}`)
  console.log(`Teacher talk: before ${pct(before, (x) => x.analysis.teacherTalkPct ?? 0)}% → since ${pct(after, (x) => x.analysis.teacherTalkPct ?? 0)}%`)
  console.log(`Wait time: before ${pct(before, (x) => x.analysis.avgWaitTimeSec ?? 0)}s → since ${pct(after, (x) => x.analysis.avgWaitTimeSec ?? 0)}s`)
  const zeroRedirect = lessons.filter((x) => x.analysis.metricsDetail.redirectionCount === 0).length
  const withDirective = lessons.filter((x) => x.analysis.metricsDetail.directiveCount > 0).length
  const withCfu = lessons.filter((x) => x.analysis.cfuCount > 0).length
  console.log(`Zero-redirection lessons ${Math.round((zeroRedirect / lessons.length) * 100)}%, clear directions ${Math.round((withDirective / lessons.length) * 100)}%, checks for understanding ${Math.round((withCfu / lessons.length) * 100)}%`)
  const minutes = lessons.map((x) => x.analysis.metricsDetail.totalDurationSec / 60)
  console.log(`Lesson length: ${Math.min(...minutes).toFixed(1)}–${Math.max(...minutes).toFixed(1)} min`)
  const others = staff.flatMap((t) => t.activities.filter((a) => a.kind !== 'lesson'))
  const count = (k: string) => others.filter((a) => a.kind === k).length
  console.log(`Other activity: ask ${count('ask')}, talk ${count('talk')}, practice ${count('practice')}, messages ${count('message')}, conversation practice ${count('prep')}, lesson plans ${count('lesson_plan')}`)
}

// ---- insert ----

const USAGE_ACTIONS: Record<Activity['kind'], string[]> = {
  lesson: ['audio_session_notes', 'class_summary', 'reflect_chat'],
  ask: ['debrief_feedback'],
  talk: ['talk_to_me', 'talk_to_me_chat', 'talk_to_me_chat'],
  practice: ['scenario_generate', 'attempt_feedback'],
  message: ['parent_message'],
  prep: ['conversation_prep_feedback'],
  lesson_plan: ['lesson_plan_generate'],
}
const CONTENT_NOTE_LABELS = ['Clarity', 'Clarity', 'Vocabulary', 'Engagement with content', 'Worth double-checking']
const PERIODS = ['1st period', '2nd period', '3rd period', '4th period', '5th period', '6th period', '7th period']

async function insert(principalEmail: string, demoTeacherEmail: string, staff: PlannedTeacher[]) {
  const { prisma } = await import('../lib/prisma.ts')
  const principalAddress = principalEmail.trim().toLowerCase()

  if (await prisma.organization.findFirst({ where: { OR: [{ name: SCHOOL_NAME }, { joinCode: JOIN_CODE }] } })) {
    throw new Error(`${SCHOOL_NAME} already exists — delete it first to rebuild.`)
  }
  if (await prisma.user.findUnique({ where: { email: principalAddress } })) throw new Error(`${principalAddress} already exists.`)
  const demoTeacher = await prisma.user.findUnique({ where: { email: demoTeacherEmail.trim().toLowerCase() } })
  if (!demoTeacher) throw new Error(`No account for ${demoTeacherEmail}.`)
  if (demoTeacher.organizationId) throw new Error(`${demoTeacherEmail} already belongs to a school.`)

  // One existing curated scenario per category for the practice attempts —
  // reused, never new rows in the shared scenario bank.
  const scenarios = await prisma.scenario.findMany({ where: { source: 'curated' }, select: { id: true, category: true } })
  const scenarioFor = (category: string) => scenarios.find((s) => s.category === category) ?? scenarios[0]
  if (!scenarios.length) throw new Error('No curated scenarios found for practice attempts.')

  const password = randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 14)
  const org = await prisma.organization.create({
    data: {
      name: SCHOOL_NAME,
      joinCode: JOIN_CODE,
      adminEmails: principalAddress,
      // A semester pilot, started at the Aug 13 kickoff.
      pilotEndsAt: new Date('2026-12-28T05:00:00Z'),
      createdAt: new Date('2026-08-10T14:00:00Z'),
    },
  })
  const principal = await prisma.user.create({
    data: {
      email: principalAddress,
      name: 'Demo Principal',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'org_admin',
      jobTitle: 'Principal',
      organizationId: org.id,
      onboardingCompletedAt: new Date('2026-08-10T15:00:00Z'),
      createdAt: new Date('2026-08-10T14:30:00Z'),
    },
  })
  await prisma.user.update({ where: { id: demoTeacher.id }, data: { organizationId: org.id } })

  let lessonCount = 0
  for (const t of staff) {
    const user = await prisma.user.create({
      data: {
        email: t.email,
        name: `${t.first} ${t.last}`,
        role: 'teacher',
        jobTitle: 'Teacher',
        organizationId: org.id,
        onboardingCompletedAt: t.onboardedAt,
        focusMetric: t.onboardedAt ? t.focusMetric : null,
        gradeLevels: `${t.grade}th`,
        subjects: t.subject,
        createdAt: t.createdAt,
      },
    })
    const usage: { userId: string; action: string; createdAt: Date }[] = []
    for (const a of t.activities) {
      USAGE_ACTIONS[a.kind].slice(0, a.kind === 'lesson' ? int(1, 3) : undefined).forEach((action, i) =>
        usage.push({ userId: user.id, action, createdAt: new Date(a.at.getTime() + (i + 1) * 4 * 60 * 1000) }),
      )
      if (a.kind === 'lesson') {
        const analysis = analyzeTranscript(a.segments)
        const lessonContent = detectLessonContent(a.segments, analysis.phases)
        const durationSec = Math.round(a.segments[a.segments.length - 1].endSec)
        const analyzedAt = new Date(a.at.getTime() + (durationSec + 300) * 1000)
        const notes = chance(0.3)
          ? Array.from({ length: int(2, 3) }, (_, i) => ({
              id: `${a.at.getTime()}-${i}`,
              label: pick(CONTENT_NOTE_LABELS),
              text: 'A short note on how this part of the explanation landed.',
              timestampSec: a.segments[Math.min(a.segments.length - 1, 5 + i * 10)].startSec,
              excerpt: a.segments[Math.min(a.segments.length - 1, 5 + i * 10)].text.slice(0, 160),
            }))
          : null
        await prisma.audioSession.create({
          data: {
            userId: user.id,
            classSubject: CLASS_NAME[t.subject](t.grade),
            gradeLevel: `${t.grade}th`,
            period: pick(PERIODS),
            sessionDate: a.at,
            consentConfirmed: true,
            status: 'analyzed',
            durationSec,
            teacherTalkPct: analysis.teacherTalkPct,
            studentTalkPct: analysis.studentTalkPct,
            questionCount: analysis.questionCount,
            higherOrderPct: analysis.higherOrderPct,
            avgWaitTimeSec: analysis.avgWaitTimeSec,
            cfuCount: analysis.cfuCount,
            metricsDetail: analysis.metricsDetail,
            highlights: analysis.highlights,
            phases: analysis.phases,
            questionLog: analysis.questionLog,
            cfuLog: analysis.cfuLog,
            feedbackLog: analysis.feedbackLog,
            directiveLog: analysis.directiveLog,
            toneLog: analysis.toneLog,
            redirectionLog: analysis.redirectionLog,
            lessonContent,
            contentNotes: notes ? { subject: lessonContent.subject ?? t.subject.toLowerCase(), notes } : undefined,
            createdAt: a.at,
            updatedAt: analyzedAt,
            segments: {
              create: a.segments.map((s) => ({
                speakerLabel: s.speakerLabel,
                rawSpeakerTag: s.speakerLabel === 'Teacher' ? 'Speaker 0' : 'Speaker 1',
                startSec: s.startSec,
                endSec: s.endSec,
                text: s.text,
                createdAt: analyzedAt,
              })),
            },
          },
        })
        lessonCount += 1
      } else if (a.kind === 'ask') {
        await prisma.debrief.create({
          data: { userId: user.id, incidentText: a.text, category: a.category, source: 'ask_tab', feedback: 'Start with a calm, private check-in, then name one clear expectation for next time.', createdAt: a.at },
        })
      } else if (a.kind === 'talk') {
        await prisma.debrief.create({
          data: {
            userId: user.id,
            incidentText: a.text,
            source: 'talk_to_me',
            conversation: [
              { role: 'user', text: a.text, createdAt: a.at.toISOString() },
              { role: 'assistant', text: 'That sounds like a lot. What part of it is weighing on you most?', createdAt: new Date(a.at.getTime() + 40_000).toISOString() },
            ],
            createdAt: a.at,
          },
        })
      } else if (a.kind === 'practice') {
        await prisma.scenarioAttempt.create({
          data: { userId: user.id, scenarioId: scenarioFor(a.category).id, responseText: 'I would stay calm, move closer, and give a quiet, specific direction.', feedback: 'Clear and calm — the quiet proximity is a strong first move.', rating: a.rating, createdAt: a.at },
        })
      } else if (a.kind === 'message') {
        await prisma.parentMessage.create({
          data: { userId: user.id, startingAction: 'new', recipientType: 'parent_caregiver', purpose: a.purpose, format: 'email', tone: a.purpose === 'positive_update' ? 'warm' : 'professional', incidentSummary: 'A note home about this week in class.', draftText: 'Hello, I wanted to share a quick update about this week in class.', createdAt: a.at },
        })
      } else if (a.kind === 'prep') {
        await prisma.conversationPrep.create({
          data: { userId: user.id, source: 'practice', category: a.category, personType: 'parent_caregiver', difficulty: 'concerned', gradeBand: isMiddle(t.grade) ? '6-8' : '9-12', situationText: 'Practicing a conversation with a concerned parent.', responseText: 'I hear that you are worried, and I want to work on this together.', rating: a.rating, createdAt: a.at },
        })
      } else {
        await prisma.lessonPlan.create({
          data: { userId: user.id, mode: 'generated', objective: a.objective, subject: t.subject, gradeLevel: `${t.grade}th`, doNow: 'Quick warm-up question on yesterday’s idea.', agenda: 'Warm-up, mini-lesson, guided practice, independent practice, exit ticket.', closure: 'Exit ticket.', hots: 'Why does this work?', homework: 'Two practice problems.', createdAt: a.at },
        })
      }
    }
    if (usage.length) await prisma.usageLog.createMany({ data: usage })
  }

  // The demo teacher's own history never logged usage (it was seeded), so
  // their work wouldn't count toward the school's activity without this.
  const demoUsage: { userId: string; action: string; createdAt: Date }[] = []
  const [demoLessons, demoTalks, demoPlans, demoMessages, demoAssignments, demoLessonPlans] = await Promise.all([
    prisma.audioSession.findMany({ where: { userId: demoTeacher.id }, select: { sessionDate: true } }),
    prisma.debrief.findMany({ where: { userId: demoTeacher.id }, select: { createdAt: true } }),
    prisma.conversationPlan.findMany({ where: { userId: demoTeacher.id }, select: { createdAt: true } }),
    prisma.parentMessage.findMany({ where: { userId: demoTeacher.id }, select: { createdAt: true } }),
    prisma.assignmentCoachSession.findMany({ where: { userId: demoTeacher.id }, select: { createdAt: true } }),
    prisma.lessonPlan.findMany({ where: { userId: demoTeacher.id }, select: { createdAt: true } }),
  ])
  for (const s of demoLessons) demoUsage.push({ userId: demoTeacher.id, action: 'audio_session_notes', createdAt: new Date(s.sessionDate.getTime() + 20 * 60 * 1000) })
  for (const d of demoTalks) demoUsage.push({ userId: demoTeacher.id, action: 'talk_to_me', createdAt: d.createdAt })
  for (const p of demoPlans) demoUsage.push({ userId: demoTeacher.id, action: 'conversation_plan_feedback', createdAt: p.createdAt })
  for (const m of demoMessages) demoUsage.push({ userId: demoTeacher.id, action: 'parent_message', createdAt: m.createdAt })
  for (const a of demoAssignments) demoUsage.push({ userId: demoTeacher.id, action: 'assignment_coach', createdAt: a.createdAt })
  for (const l of demoLessonPlans) demoUsage.push({ userId: demoTeacher.id, action: 'lesson_plan_feedback', createdAt: l.createdAt })
  if (demoUsage.length) await prisma.usageLog.createMany({ data: demoUsage })

  // The focus area the principal started on Sep 1, with its baseline frozen
  // the way the server freezes one: the share of the school's lessons before
  // that morning flagged with this theme.
  const before = await prisma.audioSession.findMany({
    where: { status: { in: ['analyzed', 'locked'] }, user: { organizationId: org.id }, sessionDate: { lt: FOCUS_STARTED } },
    select: { userId: true, teacherTalkPct: true, studentTalkPct: true, questionCount: true, higherOrderPct: true, avgWaitTimeSec: true, cfuCount: true, durationSec: true, metricsDetail: true },
  })
  const flagged = before.filter((s) => topPriorityForSession(s) === 'talk-balance')
  const sessions = before.length
  await prisma.pdFocusArea.create({
    data: {
      organizationId: org.id,
      createdByUserId: principal.id,
      themeKey: 'talk-balance',
      title: 'Talk time balance',
      suggestedAction: 'A short PD session on structuring more student talk time — think-pair-share, cold-call routines',
      baselineSnapshot: {
        count: flagged.length,
        teachers: new Set(flagged.map((s) => s.userId)).size,
        sessions,
        sharePct: sessions ? Math.round((flagged.length / sessions) * 100) : null,
        confidence: sessions < 3 ? 'none' : sessions < 5 ? 'limited' : 'full',
        capturedAt: FOCUS_STARTED.toISOString(),
      },
      createdAt: FOCUS_STARTED,
    },
  })

  console.log(`\nCreated ${SCHOOL_NAME}: ${staff.length} teachers + ${demoTeacherEmail}, ${lessonCount} lessons, principal ${principalAddress}.`)
  console.log(`Talk balance baseline: ${flagged.length} of ${sessions} lessons before Sep 1.`)
  console.log(`Password: ${password}`)
  await prisma.$disconnect()
}

const staff = TEACHERS.map(planTeacher)
const [command, ...args] = process.argv.slice(2)
if (command === 'plan') {
  summarize(staff)
} else if (command === 'insert' && args.length >= 2) {
  summarize(staff)
  await insert(args[0], args[1], staff)
} else {
  console.error('Usage: plan | insert <principal-email> <demo-teacher-email>')
  process.exit(1)
}
