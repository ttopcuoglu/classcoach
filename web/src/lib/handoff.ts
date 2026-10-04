// Carrying context from one surface to another.
//
// The cross-surface handoffs are the point of consolidating: four tools that
// used to be strangers now hand work to each other. What travels is usually
// too big for a URL — a lesson report's measured facts, a document review, a
// situation described out loud — so it goes through sessionStorage with the
// destination reading it once on arrival.
//
// Generalizes `communicationsPrefill.ts`, which did the same thing for the
// four Communication Coach tools with four separate keys and four separate
// shapes. One typed envelope instead, so a new direction is a new variant
// rather than a new module.

const KEY = 'wivoza.handoff'

/// Why the teacher is arriving, and what came with them.
export type Handoff =
  /// Lesson Debrief -> Talk It Through. Replaces the Reflect tab: the
  /// conversation now lives in Talk It Through with the rest of the
  /// teacher's conversations, rather than inside one recording where it
  /// could never be found again.
  | {
      kind: 'debrief_report'
      /// The recording this came from, so the conversation can link back.
      sessionId: string
      /// What the teacher pressed Discuss on, in their words.
      label: string
      /// The specific thing to open about.
      focus: string
      /// What the report actually measured. Facts only — never a judgment,
      /// and never anything the recording did not establish.
      detail: string | null
      timestampSec: number | null
    }
  /// Talk It Through -> Practice. The coach offered "want to rehearse it?"
  /// and the teacher said yes, so the situation they just described in their
  /// own words becomes the scenario rather than a generated one.
  | {
      kind: 'rehearse'
      /// The conversation it came from.
      debriefId: string
      /// The situation, in the teacher's words. Lands in "Describe my own"
      /// — rehearsing a generated approximation of what they just said
      /// would be worse than rehearsing their own description of it.
      situation: string
      /// The topic the conversation was tagged with, so Practice opens on it.
      topic: string | null
    }
  /// Talk It Through -> Look It Over. A document came up in conversation.
  /// Nothing travels but the intent: the document itself is still on the
  /// teacher's machine, so this only opens the drop zone knowing why.
  | {
      kind: 'review_document'
      debriefId: string
      /// What they said about it, shown back so the arrival is explained.
      about: string
    }
  /// Look It Over -> Talk It Through. The review is the context; the
  /// conversation is about what to do with it.
  | {
      kind: 'review_context'
      reviewId: string
      /// The document type, in words — "quiz or exam".
      docTypeLabel: string
      /// The one-thing card. The single most useful sentence the review
      /// produced, which is what a teacher wants to talk about.
      oneThing: string | null
    }

/// Leaves a handoff for the next surface. Overwrites any unread one: a
/// teacher who pressed one handoff and then another meant the second.
export function setHandoff(handoff: Handoff): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(handoff))
  } catch {
    // Private browsing, blocked storage. The destination opens without
    // context rather than refusing to open, which is the right failure: the
    // teacher still gets a coach, just one that has to be told what happened.
  }
}

/// Reads a handoff and clears it in the same breath.
///
/// One-shot on purpose. A handoff left in storage would re-seed the
/// conversation every time the teacher came back to Talk It Through, which
/// reads as the app being stuck on a lesson they finished talking about days
/// ago.
export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as Handoff
    return isHandoff(parsed) ? parsed : null
  } catch {
    return null
  }
}

/// Whether a handoff is waiting, without consuming it. For a surface that
/// wants to render differently on arrival before it reads the payload.
export function peekHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Handoff
    return isHandoff(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearHandoff(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to do — see setHandoff.
  }
}

function isHandoff(value: unknown): value is Handoff {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  switch (v.kind) {
    case 'debrief_report':
      return typeof v.sessionId === 'string' && typeof v.focus === 'string'
    case 'rehearse':
      // A situation is the whole payload — an empty one would open Practice
      // with a blank "describe my own" box, which is worse than not offering.
      return typeof v.situation === 'string' && v.situation.trim().length > 0
    case 'review_document':
      return typeof v.about === 'string'
    case 'review_context':
      return typeof v.reviewId === 'string' && typeof v.docTypeLabel === 'string'
    default:
      return false
  }
}

/// The opening turn a handoff produces — what the teacher is taken to have
/// said as they arrive.
///
/// First person, because it is sent as the teacher's own first turn and the
/// coach replies to it. "Let's talk about..." in the app's voice would have
/// the coach answering itself.
export function handoffOpeningMessage(handoff: Handoff): string {
  switch (handoff.kind) {
    case 'debrief_report':
      return `I want to talk about ${handoff.focus}.`
    case 'review_context':
      return `I had you look over my ${handoff.docTypeLabel.toLowerCase()} and I want to talk about what to do with it.`
    default:
      return 'I want to talk something through.'
  }
}

/// The facts that travel with it, handed to the coach as context rather than
/// as something the teacher said.
///
/// Both report facts and review findings are framed the same way: as what one
/// pass over one artifact could establish, never as a verdict. The server
/// fences this further (see buildHandoffContextBlock).
/// What the arrival strip says it came from, and the line under it. Null for
/// a handoff that does not land in Talk It Through.
export function handoffArrival(handoff: Handoff): { from: string; label: string } | null {
  switch (handoff.kind) {
    case 'debrief_report':
      return { from: 'From your lesson report', label: handoff.label }
    case 'review_context':
      return { from: `From your ${handoff.docTypeLabel.toLowerCase()} review`, label: handoff.oneThing ?? '' }
    default:
      return null
  }
}

export function handoffContext(handoff: Handoff): string | null {
  switch (handoff.kind) {
    case 'debrief_report':
      if (!handoff.detail) return null
      return `The teacher is arriving from a report on a lesson they recorded. What the report measured: ${handoff.detail}`
    case 'review_context':
      if (!handoff.oneThing) return null
      return `The teacher is arriving from a review of a ${handoff.docTypeLabel.toLowerCase()} they made. The review's single main suggestion was: ${handoff.oneThing}`
    default:
      return null
  }
}
