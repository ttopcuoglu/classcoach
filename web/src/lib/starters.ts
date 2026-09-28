import type { TeachingContext } from '../components/TeachingContextFields'

// The example questions under Ask. They used to be four fixed lines per
// section, which meant a 2nd grade art teacher and an AP Calculus teacher were
// offered the same "the same three students answer every question" — true of
// both, useful to neither.
//
// Practice has no equivalent: there the coach writes the scenario, so a teacher
// never has to phrase anything, and the Situation chips already steer what they
// get. Cards there only duplicated those chips while discarding their own text.
//
// Each starter can declare which rooms it belongs to. The picker takes the most
// specific matches first and tops up with general ones, so a starter list is
// always full but the top of it is always about the room on screen. No API call:
// this runs on every chip tap, and a teacher tapping through grade bands should
// not be waiting on a model.

export type Starter = {
  /// May contain {course} — the course if one is set, else the subject, else a
  /// neutral fallback. Written so it reads naturally in all three cases.
  text: string
  bands?: readonly string[]
  subjects?: readonly string[]
  levels?: readonly string[]
}

/// How many of a starter's declared constraints the room satisfies. Null when
/// the room contradicts one, which disqualifies it entirely.
function specificity(starter: Starter, room: TeachingContext, area?: string): number | null {
  let score = 0
  if (starter.bands) {
    if (!starter.bands.includes(room.gradeBand)) return null
    score++
  }
  // Subject and level are only asked for under Teaching and Learning, so a
  // starter that depends on them can't apply anywhere else.
  if (starter.subjects) {
    if (area !== 'teaching_and_learning' || !room.subject || !starter.subjects.includes(room.subject)) return null
    score++
  }
  if (starter.levels) {
    if (area !== 'teaching_and_learning' || !room.courseLevel || !starter.levels.includes(room.courseLevel)) {
      return null
    }
    score++
  }
  return score
}

// A course name drops into a sentence as written ("my Algebra 2 students"); a
// bare subject label does not ("the Science vocabulary"), so subjects get a
// spoken form. Proper nouns keep their capital.
const SUBJECT_IN_A_SENTENCE: Record<string, string> = {
  ELA: 'English',
  Math: 'math',
  Science: 'science',
  'History/SS': 'history',
  Technology: 'tech',
  'Fine Arts': 'art',
}

function fill(text: string, room: TeachingContext, area?: string): string {
  if (area !== 'teaching_and_learning') return text.replace(/\{course\}/g, 'this unit')
  const named = room.course ?? (room.subject ? SUBJECT_IN_A_SENTENCE[room.subject] ?? room.subject : undefined)
  return text.replace(/\{course\}/g, named ?? 'this unit')
}

/// Most specific first, topped up with general ones so the list is always full.
/// Ties keep their written order, which is deliberate — the general starters are
/// ordered by how often teachers actually bring them.
export function pickStarters<T extends Starter>(
  all: readonly T[],
  room: TeachingContext,
  area: string | undefined,
  count: number,
): (T & { text: string })[] {
  const scored = all
    .map((s) => ({ starter: s, score: specificity(s, room, area) }))
    .filter((x): x is { starter: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  const out: (T & { text: string })[] = []
  for (const { starter } of scored) {
    const text = fill(starter.text, room, area)
    if (seen.has(text)) continue
    seen.add(text)
    out.push({ ...starter, text })
    if (out.length === count) break
  }
  return out
}

export const ASK_STARTERS: Record<string, readonly Starter[]> = {
  teaching_and_learning: [
    // By level — the sharpest differences in this section.
    { text: "I can't cover the syllabus and still go deep enough.", levels: ['AP'] },
    { text: 'My strongest students coast until the exam panics them.', levels: ['AP'] },
    { text: 'They do everything I ask and I still am not sure they are learning.', levels: ['Honors'] },
    { text: 'The range of readiness in one room is about four years wide.', levels: ['Regular'] },
    { text: 'My co-teacher and I are not really splitting the teaching.', levels: ['Inclusion'] },
    { text: 'The accommodations are in place and the work is still out of reach.', levels: ['Inclusion'] },
    // By subject.
    { text: 'My {course} students can do the procedure but cannot say why it works.', subjects: ['Math'] },
    { text: 'They freeze the moment a problem does not look like my example.', subjects: ['Math'] },
    { text: 'They can summarize what they read but they cannot analyze it.', subjects: ['ELA'] },
    { text: 'My discussions stay at plot level and never get past it.', subjects: ['ELA'] },
    { text: 'They memorize the {course} vocabulary and miss the concept underneath.', subjects: ['Science'] },
    { text: 'My labs are fun and I am not convinced anyone learns from them.', subjects: ['Science'] },
    { text: 'They treat every source as equally trustworthy.', subjects: ['History/SS'] },
    { text: 'It comes out as a list of dates instead of causes.', subjects: ['History/SS'] },
    { text: 'They can follow the tutorial and cannot do it on their own.', subjects: ['Technology'] },
    { text: 'Half the room is years ahead and half has never touched this.', subjects: ['Technology'] },
    { text: 'I cannot get them past "I am just not good at this."', subjects: ['Fine Arts'] },
    { text: 'Critique turns into "it is nice" and stops there.', subjects: ['Fine Arts'] },
    // By band.
    { text: 'They can do it with me and not on their own.', bands: ['K-5'] },
    { text: 'They finish at wildly different times and I lose the room.', bands: ['K-5'] },
    { text: 'They will do the work but they will not explain their thinking.', bands: ['6-8'] },
    { text: 'They can pass my test and still not understand it.', bands: ['9-12'] },
    // General.
    { text: "I explain something well and half the room still doesn't have it." },
    { text: 'The same three students answer every question I ask.' },
    { text: "I can't tell if my grades are fair or just consistent." },
    { text: 'I run out of time before the part that actually matters.' },
  ],
  classroom_management: [
    { text: 'Lining up takes five minutes every single time.', bands: ['K-5'] },
    { text: 'Two of mine cannot sit anywhere near each other.', bands: ['K-5'] },
    { text: 'Tattling has taken over my whole morning.', bands: ['K-5'] },
    { text: 'A student pushed back in front of everyone and I froze.', bands: ['6-8'] },
    { text: 'The side conversations start the second I stop talking.', bands: ['6-8'] },
    { text: 'Phones keep coming out no matter what I say.', bands: ['6-8', '9-12'] },
    { text: 'Half of them walk in late and it is contagious.', bands: ['9-12'] },
    { text: 'A student challenged me in front of the class and had a point.', bands: ['9-12'] },
    { text: 'They are perfectly compliant and completely checked out.', bands: ['9-12'] },
    { text: 'My class talks over directions.' },
    { text: "My routines work but they've gone stale." },
    { text: 'Getting started takes five minutes every single day.' },
  ],
  parent_communication: [
    { text: 'A parent wants a daily report and I cannot sustain it.', bands: ['K-5'] },
    { text: 'A parent is upset about something at recess that I did not see.', bands: ['K-5'] },
    { text: 'A parent says their child is being singled out.', bands: ['6-8'] },
    { text: 'A parent only ever hears from me when something is wrong.', bands: ['6-8'] },
    { text: 'A parent is contesting a grade that affects a GPA.', bands: ['9-12'] },
    { text: 'A parent emailed my principal before they emailed me.', bands: ['9-12'] },
    { text: 'A parent email is stressing me out.' },
    { text: "I have to tell a parent something they won't want to hear." },
    { text: "A conference is coming up and I'm dreading it." },
  ],
  professionalism: [
    { text: 'My grade-level team does everything together and I want to try something else.', bands: ['K-5'] },
    { text: 'My department wants a common assessment I do not think fits my kids.', bands: ['9-12'] },
    { text: 'My co-teacher keeps overriding me in front of students.' },
    { text: 'I need to raise a concern with someone more senior than me.' },
    { text: 'Our team meetings never get to the work we planned.' },
    { text: "I'm behind on paperwork and it's starting to show." },
  ],
}

/// Shown when no section is picked — the coach infers the area from the text,
/// so these span all four and still narrow by grade band.
export const GENERAL_ASK_STARTERS: readonly Starter[] = [
  { text: 'Lining up takes five minutes every single time.', bands: ['K-5'] },
  { text: 'They can do it with me and not on their own.', bands: ['K-5'] },
  { text: 'The side conversations start the second I stop talking.', bands: ['6-8'] },
  { text: 'They will do the work but they will not explain their thinking.', bands: ['6-8'] },
  { text: 'They are perfectly compliant and completely checked out.', bands: ['9-12'] },
  { text: 'A parent is contesting a grade that affects a GPA.', bands: ['9-12'] },
  { text: 'My class talks over directions.' },
  { text: "I explain something well and half the room still doesn't have it." },
  { text: 'A parent email is stressing me out.' },
  { text: 'My co-teacher keeps overriding me in front of students.' },
]
