// The marked-up diff: every suggestion Look It Over makes is an edit against
// the teacher's own document, never a replacement for it.
//
// This is the load-bearing decision of the whole surface. The tool it
// replaces offered `LessonPlan.suggestedRevision` — a whole rewritten
// document, take it or leave it — and a teacher who liked two sentences of it
// had no way to take two sentences. Worse, accepting it silently replaced
// work they had written themselves.
//
// So: an edit names the exact text it replaces, what it would become, and
// why. Each one is independently accepted or kept, and the document is only
// ever assembled from the teacher's original plus whatever they said yes to.

export type EditStatus = 'pending' | 'accepted' | 'kept_mine'

export type ReviewEdit = {
  id: string
  /// The exact substring of the original this replaces. The anchor IS the
  /// match — there are no offsets, because the document can be re-extracted
  /// (a re-upload, a different OCR pass) and an offset would then point at
  /// the wrong words while still looking valid.
  anchor: string
  /// What the anchor currently says. Usually identical to `anchor`; kept
  /// separate so a model that quotes a longer span for context than it means
  /// to replace can still be rendered honestly.
  original: string
  revision: string
  /// Why, in a sentence. An edit with no reason is not offered.
  why: string
  /// Which lens produced it, so the result page can group them.
  lens: string
  /// Where in the document, as the teacher would point at it — "ITEM 7 ·
  /// MULTIPLE CHOICE". Absent on edits made before the result page had
  /// location labels; the card falls back to the lens name.
  where?: string
  /// What kind of problem this is, in three or four words: "Measures the
  /// wrong thing". A label, not a sentence — the sentence is `why`.
  tag?: string
  /// How much it matters. Drives the card's chip, and nothing else: an edit
  /// is still accepted or declined one at a time whatever its severity.
  severity?: 'high' | 'medium' | 'low'
  /// Which section of a long document it came from, so a teacher can tell
  /// where each suggestion is pointing. Absent on whole-document reviews.
  section?: string
  status: EditStatus
}

export const EDIT_STATUSES: readonly EditStatus[] = ['pending', 'accepted', 'kept_mine']

export function isEditStatus(value: unknown): value is EditStatus {
  return typeof value === 'string' && (EDIT_STATUSES as readonly string[]).includes(value)
}

/// Parses whatever is in the `edits` column back into edits, dropping
/// anything malformed.
///
/// Tolerant by design: this reads rows written by earlier versions of the
/// prompt, and one unparseable edit must not take a teacher's whole review
/// down with it.
export function parseEdits(value: unknown): ReviewEdit[] {
  if (!Array.isArray(value)) return []
  const out: ReviewEdit[] = []
  for (const raw of value) {
    const edit = parseEdit(raw)
    if (edit) out.push(edit)
  }
  return out
}

function parseEdit(raw: unknown): ReviewEdit | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const anchor = typeof r.anchor === 'string' ? r.anchor.trim() : ''
  const revision = typeof r.revision === 'string' ? r.revision.trim() : ''
  const why = typeof r.why === 'string' ? r.why.trim() : ''
  // An edit with nothing to anchor to cannot be rendered as a diff, and one
  // with no reason is not something to ask a teacher to accept.
  if (!anchor || !why) return null
  // A revision identical to the original is not a suggestion.
  if (revision === anchor) return null
  const severity: ReviewEdit['severity'] =
    r.severity === 'high' || r.severity === 'medium' || r.severity === 'low' ? r.severity : undefined
  const optional = {
    ...(typeof r.where === 'string' && r.where.trim() ? { where: r.where.trim() } : {}),
    ...(typeof r.tag === 'string' && r.tag.trim() ? { tag: r.tag.trim() } : {}),
    ...(severity ? { severity } : {}),
    ...(typeof r.section === 'string' && r.section.trim() ? { section: r.section.trim() } : {}),
  }
  return {
    id: typeof r.id === 'string' && r.id ? r.id : anchor.slice(0, 32),
    anchor,
    original: typeof r.original === 'string' && r.original.trim() ? r.original.trim() : anchor,
    revision,
    why,
    lens: typeof r.lens === 'string' ? r.lens : '',
    ...optional,
    status: isEditStatus(r.status) ? r.status : 'pending',
  }
}

/// How many edits the teacher has actually accepted. This number, and only
/// this number, is what the export button says.
export function acceptedCount(edits: ReviewEdit[]): number {
  return edits.filter((e) => e.status === 'accepted').length
}

/// What the export button reads.
///
/// "Export my original" until something is accepted, then "Export with N
/// changes" — so a teacher always knows whether they are about to download
/// their own document or an edited one, without having to remember what they
/// tapped. Pending and kept-mine edits both count as not accepted: declining
/// a suggestion and not having answered it yet produce the same document.
export function exportLabel(edits: ReviewEdit[]): string {
  const n = acceptedCount(edits)
  if (n === 0) return 'Export my original'
  return `Export with ${n} ${n === 1 ? 'change' : 'changes'}`
}

/// Applies one status change, returning a new array.
export function setEditStatus(edits: ReviewEdit[], id: string, status: EditStatus): ReviewEdit[] {
  return edits.map((e) => (e.id === id ? { ...e, status } : e))
}

/// The document as it stands: the teacher's original with accepted edits
/// applied and nothing else.
///
/// Each accepted edit replaces the FIRST remaining occurrence of its anchor.
/// An anchor that is no longer present is skipped rather than guessed at —
/// which happens when two edits overlap and the first one consumed the text
/// the second was anchored to. Silently dropping the second is the safe
/// failure: the alternative is corrupting a sentence the teacher wrote.
export function applyAcceptedEdits(originalText: string, edits: ReviewEdit[]): string {
  let out = originalText
  for (const edit of edits) {
    if (edit.status !== 'accepted') continue
    const at = out.indexOf(edit.anchor)
    if (at < 0) continue
    out = out.slice(0, at) + edit.revision + out.slice(at + edit.anchor.length)
  }
  return out
}

/// Edits whose anchor cannot be found in the document at all.
///
/// Worth surfacing rather than hiding: it means the model quoted text that is
/// not in the original, which is the one failure mode that would let a
/// "suggestion" invent a sentence and attribute it to the teacher.
export function unanchoredEdits(originalText: string, edits: ReviewEdit[]): ReviewEdit[] {
  return edits.filter((e) => !originalText.includes(e.anchor))
}

// --- timing ---

export type TimingBasis = {
  /// Low and high bounds in minutes. A single number is never stored — an
  /// estimate presented without a range reads as a measurement.
  minutes: [number, number]
  /// What the range assumes, in a sentence a teacher can disagree with.
  assumption: string
}

export function parseTimingBasis(value: unknown): TimingBasis | null {
  if (!value || typeof value !== 'object') return null
  const r = value as Record<string, unknown>
  const assumption = typeof r.assumption === 'string' ? r.assumption.trim() : ''
  if (!assumption) return null
  const raw = r.minutes
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const low = Number(raw[0])
  const high = Number(raw[1])
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) return null
  return { minutes: [low, high], assumption }
}

/// "20–30 minutes", or "about 25 minutes" when the bounds collapsed.
export function formatTimingRange(basis: TimingBasis): string {
  const [low, high] = basis.minutes
  if (low === high) return `about ${low} minutes`
  return `${low}–${high} minutes`
}
