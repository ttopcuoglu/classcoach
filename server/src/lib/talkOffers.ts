// When a conversation produces something worth doing somewhere else.
//
// Talk It Through deliberately produces no deliverable up front: a teacher
// who opens it has a situation, not a request for an artifact. But a
// conversation does reach points where another surface is obviously the next
// move — they have described a hard exchange they are about to have, or
// mentioned a document they are unsure about. At those points the coach
// offers, inline, once.
//
// The alternative designs were worse in specific ways. A permanent row of
// "rehearse this / review a document" buttons is the tool menu the
// consolidation removed, just relocated under the mic. Client-side keyword
// matching on the reply ("if it says rehearse...") would fire on the coach
// merely using the word. So the coach says when, in a tag, and the tag is
// stripped before the teacher sees anything.

export const OFFER_KINDS = ['rehearse', 'document'] as const

export type OfferKind = (typeof OFFER_KINDS)[number]

export function isOfferKind(value: unknown): value is OfferKind {
  return typeof value === 'string' && (OFFER_KINDS as readonly string[]).includes(value)
}

/// What the teacher is shown, and where the chip goes.
///
/// First person and tentative, because it interrupts a conversation: an
/// offer phrased as an instruction ("Rehearse this now") reads as the app
/// deciding the conversation is over.
export const OFFER_COPY: Record<OfferKind, { label: string; to: string }> = {
  rehearse: { label: 'Want to rehearse it?', to: '/practice' },
  document: { label: 'Want me to look it over?', to: '/look-it-over' },
}

/// Appended to the Talk It Through prompt.
///
/// Constant for every teacher, so it sits inside the cached system prompt
/// rather than the per-conversation tail.
///
/// The conditions are deliberately narrow and the default is silence. An
/// offer on every turn would be a coach that keeps trying to end the
/// conversation, which is the opposite of what a teacher talking something
/// through wants — and the one on the turn where it IS right only works
/// because the other turns have none.
export const OFFER_INSTRUCTION = `
Twice in this conversation at most, and only when one of these is plainly true, end your reply with a tag on its own line:

<offer>rehearse</offer> — the teacher has described a specific conversation they are about to have with a real person, and saying it out loud once before they say it for real would help more than more advice would.
<offer>document</offer> — the teacher has mentioned a specific document they made and are unsure about (a quiz, a plan, a slide deck, an assignment, a message they have drafted) and the useful next step is reading it rather than discussing it.

Rules about the tag, which matter more than the tag:
- Say nothing about it in your reply. The teacher sees a button; your words should read exactly the same with or without it.
- Default to no tag. Most turns should not have one, and a conversation with none is a normal conversation.
- Never offer on your first reply, before you know what this is about.
- Never offer twice in a row, and never the same kind twice in one conversation.
- Never offer when the teacher is upset and still describing it — they came to be heard, and an offer to go and do an exercise lands as being dismissed. Wait until the conversation has turned toward what to do.
- An offer is not a way to end the conversation. Carry on as though you had not made it.
`
