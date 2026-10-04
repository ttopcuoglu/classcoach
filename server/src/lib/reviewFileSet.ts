/// Several documents, reviewed as one thing.
///
/// "An assignment plus its rubric, or a packet photographed page by page, is
/// one review — not five." What a teacher wants from two files is usually the
/// comparison between them, which is precisely what they cannot get by
/// reviewing each separately.

import { DOC_TYPE_LABELS, isDocType, type DocType } from './reviewLenses.ts'

export const MAX_FILES_PER_REVIEW = 5

export type IncomingFile = {
  text: string
  fileName?: string | null
  sourceKind?: string | null
  pageCount?: number | null
  mime?: string | null
  bytes?: number | null
  docType?: string | null
}

/// The text the model reads, with each file named.
///
/// Headed rather than simply joined: without the names, an edit anchored in
/// the rubric and an edit anchored in the assignment are indistinguishable,
/// and the model has no way to say "the rubric does not match the directions"
/// because it cannot tell which text is which.
export function combineFiles(files: IncomingFile[]): string {
  if (files.length === 1) return files[0].text
  return files
    .map((file, i) => `--- ${file.fileName?.trim() || `Document ${i + 1}`} ---\n${file.text}`)
    .join('\n\n')
}

/// "An assignment and a rubric — I'll check them against each other."
///
/// Returns null for a single file, where there is nothing to say, and for a
/// set that is all one type, where naming it twice says nothing either.
export function describeFileSet(files: IncomingFile[]): string | null {
  if (files.length < 2) return null
  const types = files
    .map((f) => f.docType)
    .filter((t): t is DocType => typeof t === 'string' && isDocType(t))
  const distinct = [...new Set(types)]
  if (distinct.length < 2) {
    return `${files.length} documents — I'll read them as one.`
  }
  const names = distinct.map((t) => withArticle(DOC_TYPE_LABELS[t].toLowerCase()))
  const list =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${capitalise(list)} — I'll check them against each other.`
}

function withArticle(label: string): string {
  return /^[aeiou]/.test(label) ? `an ${label}` : `a ${label}`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/// What the set as a whole is, for choosing the lens set.
///
/// The most specific type wins rather than the first or the commonest: a
/// rubric uploaded beside an assignment is there to be checked against it, so
/// the review is of the assignment and the rubric is evidence. `order` is the
/// spec's own list, least specific last.
const SPECIFICITY: DocType[] = [
  'quiz',
  'lesson_plan',
  'presentation',
  'project',
  'homework',
  'rubric',
  'message',
  'assignment',
]

export function primaryType(files: IncomingFile[], fallback: DocType): DocType {
  const types = files
    .map((f) => f.docType)
    .filter((t): t is DocType => typeof t === 'string' && isDocType(t))
  if (types.length === 0) return fallback
  // A rubric on its own is a rubric; a rubric beside something else is a lens
  // on that something else.
  const notRubric = types.filter((t) => t !== 'rubric')
  const pool = notRubric.length > 0 ? notRubric : types
  return [...pool].sort((a, b) => SPECIFICITY.indexOf(a) - SPECIFICITY.indexOf(b))[0]
}
