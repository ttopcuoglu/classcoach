import type { ClassContext } from './api'
import { CLASS_MAKEUP, GRADE_BANDS, SUBJECTS, courseLevelsFor, coursesFor } from './teachingContext'

// Deciding the ONE question a coach may ask inline when it needs something
// about the room that it does not know.
//
// The brief allows exactly one, offered as tappable chips, saved reversibly.
// One is the whole point: the five-field panel this replaces is what made
// every surface feel like a form, and a coach that asks three questions in a
// row has rebuilt it inside the conversation. So this returns a single
// question or nothing at all, and the caller cannot ask for more.
//
// It also never asks for something it already knows, and never asks for
// something that cannot exist — there is no course to name in a K-2 room, and
// no level to pick in a band that offers only one.

export type ClassContextField = 'gradeBand' | 'subject' | 'course' | 'courseLevel' | 'classMakeup'

export type ClassContextQuestion = {
  field: ClassContextField
  /// Asked in the coach's voice, because it appears inside the conversation.
  question: string
  options: { value: string; label: string }[]
  /// Who's-in-the-room is the only multi-select, and the only one that can be
  /// answered "neither".
  multi?: boolean
}

/// The order fields narrow each other, which is also the order worth asking
/// in: a subject means little without a band, and a course means nothing
/// without a subject.
const ORDER: ClassContextField[] = ['gradeBand', 'subject', 'course', 'courseLevel', 'classMakeup']

/// Whether this prep already answers a field. A prep that does not exist
/// answers nothing.
function known(prep: ClassContext | null, field: ClassContextField): boolean {
  if (!prep) return false
  if (field === 'classMakeup') {
    // An empty makeup list is ambiguous — it means either "nobody" or "never
    // asked" — so it counts as known only once the teacher has confirmed the
    // prep. Otherwise a teacher who genuinely has neither would be asked
    // forever.
    return prep.confirmed
  }
  const value = prep[field]
  return typeof value === 'string' && value.trim() !== ''
}

/// Whether a field can be answered at all for this prep. Asking a 2nd grade
/// teacher which course they teach has no right answer.
function askable(prep: ClassContext | null, field: ClassContextField): boolean {
  if (field === 'course') {
    if (!prep?.gradeBand || !prep.subject) return false
    return coursesFor(prep.gradeBand, prep.subject).length > 0
  }
  if (field === 'courseLevel') {
    if (!prep?.gradeBand) return false
    // One level is not a choice — K-2 and 3-5 offer only "Regular".
    return courseLevelsFor(prep.gradeBand).length > 1
  }
  return true
}

function optionsFor(prep: ClassContext | null, field: ClassContextField): { value: string; label: string }[] {
  switch (field) {
    case 'gradeBand':
      return GRADE_BANDS.map((b) => ({ value: b, label: `Grades ${b}` }))
    case 'subject':
      return SUBJECTS.map((s) => ({ value: s, label: s }))
    case 'course':
      return coursesFor(prep?.gradeBand, prep?.subject).map((c) => ({ value: c, label: c }))
    case 'courseLevel':
      return courseLevelsFor(prep?.gradeBand).map((l) => ({ value: l, label: l }))
    case 'classMakeup':
      return CLASS_MAKEUP.map((m) => ({ value: m.value, label: m.label }))
  }
}

const QUESTIONS: Record<ClassContextField, string> = {
  gradeBand: 'What grades is this?',
  subject: 'What subject?',
  course: 'Which course?',
  courseLevel: 'How is it tracked?',
  classMakeup: "Anyone I should keep in mind — who's in the room?",
}

/// The one question to ask, or null when there is nothing worth asking.
///
/// `needs` is what the coach actually wants for the work in front of it, so a
/// topic that does not care about subject never triggers a subject question.
/// Null is the common case and the caller must handle it silently — an
/// unanswered question never blocks an action.
export function nextClassContextQuestion(
  prep: ClassContext | null,
  needs: readonly ClassContextField[],
): ClassContextQuestion | null {
  for (const field of ORDER) {
    if (!needs.includes(field)) continue
    if (known(prep, field)) continue
    if (!askable(prep, field)) continue
    const options = optionsFor(prep, field)
    // Nothing to offer is not a question. Chips with no chips in them would
    // be a dead end the teacher cannot answer or dismiss.
    if (options.length === 0) continue
    return {
      field,
      question: QUESTIONS[field],
      options,
      multi: field === 'classMakeup',
    }
  }
  return null
}
