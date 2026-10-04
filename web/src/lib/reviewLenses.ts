// Look It Over's document types and lenses, labels only.
//
// Mirrors `server/src/lib/reviewLenses.ts`. The lens instructions — what the
// model is actually asked to look for — live on the server and never ship to
// a browser, same convention as the topics.
//
// Detection is NOT mirrored: it runs on the server so one implementation
// answers both the upload path and the paste path. The client only renders
// the answer.

export const DOC_TYPES = [
  'quiz',
  'homework',
  'assignment',
  'project',
  'lesson_plan',
  'presentation',
  'rubric',
  'message',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  quiz: 'Quiz / exam',
  homework: 'Homework',
  assignment: 'Assignment',
  project: 'Project',
  lesson_plan: 'Lesson plan',
  presentation: 'Presentation',
  rubric: 'Rubric',
  message: 'Message',
}

/// What the confirmation strip says. A question, with the chips beside it to
/// correct the answer — never "What is this?", which is the interrogation the
/// surface exists to avoid.
/// What the question calls each type. Shorter than the chip's own label,
/// because "Looks like a quiz / exam — right?" reads as a form field and
/// "Looks like a quiz — right?" reads as someone asking.
const DOC_TYPE_IN_A_SENTENCE: Record<DocType, string> = {
  quiz: 'quiz',
  homework: 'homework assignment',
  assignment: 'assignment',
  project: 'project',
  lesson_plan: 'lesson plan',
  presentation: 'presentation',
  rubric: 'rubric',
  message: 'message',
}

/// The line under "Looks like a quiz — right?" — what in the document pointed
/// that way, then how to correct it.
///
/// Reasons make a wrong guess obviously wrong instead of mysteriously wrong,
/// which is the difference between a teacher correcting it and a teacher
/// wondering what the app thinks it is reading. With nothing to show — a
/// document that matched no signal at all, which is why the guess was weak —
/// it just says how to correct it rather than inventing a reason.
export function detectionHint(evidence: readonly string[]): string {
  if (evidence.length === 0) return 'Tap any of these to correct me.'
  const joined = evidence.length === 1 ? evidence[0] : `${evidence[0]} and ${evidence[1]}`
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}. Tap any to correct me.`
}

/// What the strip says once the teacher has corrected the guess.
///
/// It stops asking, because the question has been answered — and says what
/// the answer cost, since changing the type swaps the whole lens set and a
/// teacher who does not notice that will wonder why the result changed.
export function correctedHeading(docType: DocType): string {
  return `Got it — reviewing as ${DOC_TYPE_AS[docType]}.`
}

/// The bare noun, for a sentence that takes no article: "reviewing as
/// homework", where the question needs "a homework assignment".
const DOC_TYPE_AS: Record<DocType, string> = {
  quiz: 'a quiz',
  homework: 'homework',
  assignment: 'an assignment',
  project: 'a project',
  lesson_plan: 'a lesson plan',
  presentation: 'a presentation',
  rubric: 'a rubric',
  message: 'a message',
}

export const CORRECTED_HINT = "Different type, different checks. Here's what changes."

export function confirmQuestion(docType: DocType): string {
  return `Looks like ${article(DOC_TYPE_IN_A_SENTENCE[docType])} — right?`
}

function article(label: string): string {
  const lower = label.toLowerCase()
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`
}

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value)
}

/// The document types where "Redesign for meaningful AI use" means something.
/// A lesson plan or a parent message has no student work for a chatbot to do.
export const REDESIGNABLE_TYPES: readonly DocType[] = ['assignment', 'homework', 'project', 'quiz']

export function canRedesignForAi(docType: string): boolean {
  return (REDESIGNABLE_TYPES as readonly string[]).includes(docType)
}
