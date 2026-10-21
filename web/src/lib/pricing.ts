// Every price and plan description a teacher reads, in one place. They were
// written out by hand on five pages, and all five called Plus "unlimited"
// while the server capped Lesson Debrief at 20 a month — a promise the
// product did not keep. Nothing here says unlimited: every tier has monthly
// limits, generous ones, and the one a teacher could plausibly reach is named.
//
// The 20 must match PAID_MONTHLY_LIMITS.lesson_debrief in
// server/src/lib/billing.ts. The prices must match the Stripe prices behind
// STRIPE_PLUS_PRICE_ID and STRIPE_PLUS_YEARLY_PRICE_ID.

export const PLUS_MONTHLY_PRICE = '$14.99'
export const PLUS_YEARLY_PRICE = '$119'
/// $119 / 12, rounded down so it never overstates the saving.
export const PLUS_YEARLY_PER_MONTH = '$9.92'
export const PLUS_DEBRIEF_PER_MONTH = 20
export const FREE_DEBRIEF_PER_MONTH = 3

export const PLUS_SUMMARY = `Lesson Debrief for up to ${PLUS_DEBRIEF_PER_MONTH} lessons a month, Planning Coach, Communication Coach, and Coach's memory.`
export const FREE_SUMMARY = `Talk It Through and Practice, plus ${FREE_DEBRIEF_PER_MONTH} Lesson Debrief recordings a month.`
