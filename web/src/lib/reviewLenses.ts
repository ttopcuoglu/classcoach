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
  'message',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  quiz: 'Quiz or exam',
  homework: 'Homework',
  assignment: 'Assignment',
  project: 'Project',
  lesson_plan: 'Lesson plan',
  presentation: 'Presentation',
  message: 'Message',
}

/// What the confirmation strip says. A question, with the chips beside it to
/// correct the answer — never "What is this?", which is the interrogation the
/// surface exists to avoid.
export function confirmQuestion(docType: DocType): string {
  return `Looks like ${article(DOC_TYPE_LABELS[docType])} — right?`
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
