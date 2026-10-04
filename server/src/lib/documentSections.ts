/// Finding the parts of a long document, so a review can be scoped to one.
///
/// "Long documents are accepted. What changes is how much gets reviewed at
/// once, because a single pass over 50 pages produces mush." A teacher who
/// uploads a 48-page packet is not asking about all of it — they are usually
/// about to teach one unit of it — and the honest move is to ask which rather
/// than to refuse, or to silently review the first ten pages.

export type DocumentSection = {
  /// What the teacher is offered: "Unit 3 (p. 12–20)", "Slides 1–12".
  label: string
  /// Character offsets into the extracted text.
  start: number
  end: number
}

/// Roughly a page of extracted text. Used only to turn offsets into page
/// numbers for the label, which is the form a teacher thinks in.
const CHARS_PER_PAGE = 1800

/// Above these, a single pass stops being a review and starts being a
/// summary. Taken from the spec; `pageCount` is used when the extractor knew
/// it, and the text length stands in when it did not.
export const LONG_DOCUMENT = { pages: 30, slides: 60, rows: 2000 } as const

export function isLongDocument(text: string, pageCount: number | null, docType: string): boolean {
  if (docType === 'presentation') return countSlides(text) > LONG_DOCUMENT.slides
  if (countRows(text) > LONG_DOCUMENT.rows) return true
  const pages = pageCount ?? Math.ceil(text.length / CHARS_PER_PAGE)
  return pages > LONG_DOCUMENT.pages
}

function countSlides(text: string): number {
  return (text.match(/^\s*slide\s+\d+/gim) ?? []).length
}

function countRows(text: string): number {
  // A delimited line with at least two separators is a row rather than a
  // sentence that happens to contain a comma.
  return text.split('\n').filter((line) => (line.match(/[,\t;|]/g) ?? []).length >= 2).length
}

/// A heading: a short line that is not a sentence.
///
/// Deliberately conservative. A false heading splits a section in the wrong
/// place and the teacher is offered a range that means nothing to them, which
/// is worse than offering fewer, truer parts.
// Two patterns, not one: the all-caps form has to be case-SENSITIVE, and a
// single regex with /i turned it into "any line of text", which made every
// line of ordinary prose a heading.
const HEADING_KEYWORD = /^\s{0,3}(#{1,3}\s+\S|(unit|chapter|section|part|lesson|day|week|module)\b[^.!?]{0,60}$)/i
const HEADING_CAPS = /^\s{0,3}[A-Z][A-Z0-9 ,'’&-]{4,60}$/

function looksLikeHeading(line: string): boolean {
  return HEADING_KEYWORD.test(line) || HEADING_CAPS.test(line)
}

const SLIDE_HEADING = /^\s*slide\s+(\d+)/i
const SHEET_HEADING = /^\s*(sheet|tab)\s*[:：]?\s*(.{1,40})$/i

/// The parts of a document, in order.
///
/// Returns an empty list when nothing separable was found — a wall of prose
/// with no headings genuinely has no parts, and inventing some would offer a
/// teacher a choice between arbitrary slices of their own document.
export function detectSections(text: string, docType: string): DocumentSection[] {
  const lines = text.split('\n')
  const breaks: { index: number; title: string }[] = []
  let offset = 0
  const offsets: number[] = []
  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }

  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const sheet = SHEET_HEADING.exec(trimmed)
    if (sheet) {
      breaks.push({ index: i, title: sheet[2].trim() })
      continue
    }
    if (docType === 'presentation') {
      const slide = SLIDE_HEADING.exec(trimmed)
      if (slide) breaks.push({ index: i, title: `Slide ${slide[1]}` })
      continue
    }
    if (trimmed.length <= 70 && looksLikeHeading(trimmed)) {
      breaks.push({ index: i, title: trimmed.replace(/^#{1,3}\s+/, '') })
    }
  }

  if (breaks.length < 2) return []

  // Slides are grouped rather than offered one at a time: nobody wants to
  // choose between sixty parts, and a single slide is not a unit of review.
  const grouped = docType === 'presentation' ? groupEvery(breaks, 12) : breaks

  return grouped.map((brk, i) => {
    const start = offsets[brk.index]
    const end = i + 1 < grouped.length ? offsets[grouped[i + 1].index] : text.length
    return { label: labelFor(brk.title, start, end, docType), start, end }
  })
}

function groupEvery<T>(items: T[], size: number): T[] {
  return items.filter((_, i) => i % size === 0)
}

function labelFor(title: string, start: number, end: number, docType: string): string {
  if (docType === 'presentation') return title
  const first = Math.floor(start / CHARS_PER_PAGE) + 1
  const last = Math.max(first, Math.ceil(end / CHARS_PER_PAGE))
  const pages = first === last ? `p. ${first}` : `p. ${first}–${last}`
  const short = title.length > 40 ? `${title.slice(0, 39).trimEnd()}…` : title
  return `${short} (${pages})`
}

/// The slice of text a chosen section covers.
export function sliceSection(text: string, section: DocumentSection): string {
  return text.slice(section.start, section.end)
}

/// How long a review of this much text takes, as a range in minutes, so the
/// page can say before it starts rather than after.
export function estimateMinutes(chars: number): [number, number] {
  const perPass = Math.max(1, Math.ceil(chars / 20_000))
  return [perPass, perPass * 2]
}
