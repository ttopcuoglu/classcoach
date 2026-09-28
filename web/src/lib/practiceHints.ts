import { TEACHING_AND_LEARNING } from './focusAreas'

// A nudge for a teacher facing a blank box under a dense scenario.
//
// Every hint is a QUESTION, never an answer or an option to pick. The value of
// Practice is that the teacher composes a response themselves — recognising a
// good answer and producing one under pressure are different skills, and only
// the second one happens at 10:15 on a Tuesday. A hint that scaffolds the shape
// of the thinking keeps that intact; a list of candidate responses would not,
// and would quietly corrupt the private rating that steers future practice,
// since it would then be scoring recognition rather than the teacher's instinct.
//
// Offered to everyone, not just newer teachers. Expertise is domain-specific:
// a fifteen-year veteran handed their first inclusion section or their first
// parent scenario is a beginner in that moment, and `experienceLevel` is unset
// for almost every teacher anyway. A hint only novices can see is also a label,
// in a product whose promise is that nothing here is scored or watched.

/// Keyed by course level, which only Teaching and Learning asks for — so these
/// are the sharpest hints available when a teacher has told us the most.
const BY_LEVEL: Record<string, readonly string[]> = {
  Inclusion: [
    'What is your co-teacher doing while you handle this?',
    'Is the barrier the thinking itself, or how the task is presented?',
  ],
  AP: [
    'What would you cut to make room for this, and what does cutting it cost?',
    'Which students are holding on rather than keeping up?',
  ],
  Honors: ['Are they stuck, or are they finished and unchallenged?'],
  Regular: ['Who in this room is furthest from the goal, and what do they need first?'],
}

const BY_AREA: Record<string, readonly string[]> = {
  teaching_and_learning: [
    'What does this student already believe that is getting in the way?',
    'What would you need to see or hear to know they actually have it?',
    'What is the smallest change you could make to how you explain it?',
  ],
  classroom_management: [
    'What might this student be getting out of the behaviour?',
    'What is the smallest response that keeps the lesson moving?',
    'Does this need handling now, or after class?',
  ],
  parent_communication: [
    'What does this parent most need to hear first?',
    'What can you say that is specific and true about their child?',
    'What do you want to be different after this exchange?',
  ],
  professionalism: [
    'What do you and this person both want for the student?',
    'What might you be missing about why they did it that way?',
    'What is the specific request you would make, rather than the complaint?',
  ],
}

const GENERAL: readonly string[] = [
  'What is the first thing you would say out loud?',
  'What do you want to be different five minutes from now?',
]

/// Most specific first — level, then section, then general — so the first hint
/// a teacher sees is the one that knows the most about their room.
///
/// The level is only honoured under Teaching and Learning, the one section that
/// asks for it. A teacher who picks Inclusion there and switches to Classroom
/// Management still carries the value in state, hidden; the routes already
/// discard it in that case, and the hints have to agree or the screen would
/// suggest something the coaching never saw.
export function hintsFor(focusArea?: string, courseLevel?: string): string[] {
  const usableLevel = focusArea === TEACHING_AND_LEARNING ? courseLevel : undefined
  const level = usableLevel ? BY_LEVEL[usableLevel] ?? [] : []
  const area = focusArea ? BY_AREA[focusArea] ?? [] : []
  return [...level, ...area, ...GENERAL]
}
