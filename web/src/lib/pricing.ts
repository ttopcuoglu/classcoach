// Every price and plan description a teacher reads, in one place. They were
// written out by hand on five pages, and all five called Plus "unlimited"
// while the server capped Lesson Debrief at 20 a month — a promise the
// product did not keep. Nothing here says unlimited: every tier has monthly
// limits, generous ones, and the one a teacher could plausibly reach is named.
//
// The 20 must match PAID_MONTHLY_LIMITS.lesson_debrief in
// server/src/lib/billing.ts. The prices must match the Stripe prices behind
// STRIPE_PLUS_PRICE_ID and STRIPE_PLUS_YEARLY_PRICE_ID.

// Wivoza is sold to schools and districts only since 2026-11-04: no
// individual Plus subscription, no teacher-facing prices, no upgrade button.
// A teacher gets full access through their school's license (join code).
// Anyone already subscribed keeps Manage subscription in Profile & Settings.
// Flip to true to bring back the individual plan and every price; the server's
// limit messages (billing.ts) and the help chat (supportKnowledge.ts) are
// worded for schools separately.
export const INDIVIDUAL_PLAN = false

export const PLUS_MONTHLY_PRICE = '$14.99'
export const PLUS_YEARLY_PRICE = '$119'
/// $119 / 12, rounded down so it never overstates the saving.
export const PLUS_YEARLY_PER_MONTH = '$9.92'
export const PLUS_DEBRIEF_PER_MONTH = 20
export const FREE_DEBRIEF_PER_MONTH = 3

export const PLUS_SUMMARY = `Lesson Debrief for up to ${PLUS_DEBRIEF_PER_MONTH} lessons a month, Planning Coach, Communication Coach, and Coach's memory.`
export const SCHOOL_PITCH = `More Lesson Debriefs, Planning Coach and Communication Coach come with a school or district license.`
export const FREE_SUMMARY = `Talk It Through and Practice, plus ${FREE_DEBRIEF_PER_MONTH} Lesson Debrief recordings a month.`
