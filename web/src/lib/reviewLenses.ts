// Look It Over's document types and lenses, labels only.
//
// Mirrors `server/src/lib/reviewLenses.ts`. The lens instructions — what the
// model is actually asked to look for — live on the server and never ship to
// a browser, same convention as the topics.
//
// Detection is NOT mirrored: it runs on the server so one implementation
// answers both the upload path and the paste path. The client only renders
// the answer.

/// How many documents one review may hold. An assignment plus its rubric, or
/// a packet photographed page by page, is one review — not five of them.
///
/// Lives here rather than beside the API calls because the page needs it to
/// decide what to send, and a constant that disappears when the API module is
/// mocked is a constant that silently becomes NaN in a test.
/// The lenses each type opens with, for the line that tells a teacher what
/// picking it buys — "I'll look at: what each item measures, reading load…".
///
/// Labels only, mirrored by hand from server/src/lib/reviewLenses.ts, which
/// owns the real set and the instructions behind it. The review's own lenses
/// always come from the server; this is a preview shown BEFORE anything is
/// uploaded, which is the one moment the server has nothing to say yet. Drift
/// here costs a stale sentence, never a wrong review.
export const LENS_PREVIEW: Record<DocType, string[]> = {
  quiz: [
    'what each item measures',
    'reading load',
    'answer choices',
    'standards coverage',
    'will it fit the period',
    'AI completion risk',
  ],
  homework: [
    "how long it'll really take",
    'practice or new learning',
    'doable without help at home',
    'are the directions clear alone',
    'what you do with it tomorrow',
    'AI completion risk',
  ],
  assignment: [
    'grade fit',
    'thinking and rigor',
    'learning value',
    'workload',
    'directions and examples',
    'AI completion risk',
  ],
  project: [
    'grade fit',
    'where the thinking happens',
    'workload across the timeline',
    "group work and who's accountable",
    'rubric and success criteria',
    'AI completion risk',
  ],
  lesson_plan: [
    'timing realism',
    'objective-to-activity fit',
    'where students do the thinking',
    'checks for understanding',
    'if it runs short or long',
    'materials and prep',
  ],
  presentation: [
    'slide load and text density',
    'how the ideas build',
    'how it opens',
    'where the thinking happens',
    'where students do something',
    'how it ends',
    'grade-level fit',
    'legible from the back row',
    'what you have to carry',
    'how to actually run it',
    'pacing against the period',
  ],
  rubric: [
    'are the criteria distinct',
    'do the levels describe different work',
    'does the weighting match what matters',
    'can a student read it and know what to do',
    'does it match the assignment',
  ],
  message: ['clarity', 'tone for this reader', 'what it invites in response', "what's missing"],
}

/// The first few, and how many more — the whole list is a wall of text at the
/// moment a teacher is only deciding whether this surface is the right one.
export function lensPreview(docType: DocType): string {
  const all = LENS_PREVIEW[docType]
  const shown = all.slice(0, 3).join(', ')
  const rest = all.length - 3
  return rest > 0 ? `${shown}, and ${rest} more` : shown
}

export const MAX_FILES_PER_REVIEW = 5

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
export const DOC_TYPE_IN_A_SENTENCE: Record<DocType, string> = {
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
