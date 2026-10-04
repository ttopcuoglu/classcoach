// What an inline offer says, and where it goes.
//
// Mirrors the copy and destinations in `server/src/lib/talkOffers.ts`. The
// instruction that decides WHEN the coach offers lives there and never ships
// to a browser.

export const OFFER_KINDS = ['rehearse', 'document'] as const

export type OfferKind = (typeof OFFER_KINDS)[number]

export function isOfferKind(value: string | null | undefined): value is OfferKind {
  return !!value && (OFFER_KINDS as readonly string[]).includes(value)
}

/// First person and tentative, because it interrupts a conversation. An offer
/// phrased as an instruction ("Rehearse this now") reads as the app deciding
/// the conversation is over.
export const OFFER_COPY: Record<OfferKind, { label: string; action: string }> = {
  rehearse: { label: 'Want to rehearse it?', action: 'Rehearse it' },
  document: { label: 'Want me to look it over?', action: 'Look it over' },
}
