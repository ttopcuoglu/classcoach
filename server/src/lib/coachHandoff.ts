// Carrying what Coach already knows into the tool it just offered.
//
// Coach offers another tool as a button under its reply (betterTool.ts).
// Tapping it opened an empty form, so a teacher who had just told Coach the
// topic, the grade and the day typed all three again — which is most of the
// reason they were in the chat instead of the form. The button now carries
// an opaque id, and the tool asks for what Coach collected.
//
// The id travels in a URL; the details never do. A teacher's own words
// about their class have no business in a query string, where they end up
// in browser history, proxy logs and whatever sits in between. So they are
// held here and handed over once, to the account they belong to.
//
// In memory rather than a table, like the other short-lived bookkeeping in
// telegramCoach.ts: a teacher taps seconds after reading the reply, nothing
// here needs to outlive that, and a deploy in between costs them the
// prefill, not the lesson — the form opens exactly as it does today. A
// column would mean a migration for a record whose whole life is one tap.

import { randomBytes } from 'node:crypto'
import type { HandoffDetails, ToolKey } from './betterTool.ts'

// Long enough to read a reply, make tea, and come back; short enough that a
// forgotten link is not a standing offer.
const TTL_MS = 30 * 60 * 1000
// A cap so a busy day can't grow this without bound. Oldest first, which is
// insertion order here — each entry is written once and never updated.
const MAX_ENTRIES = 500

type Entry = { userId: string; tool: ToolKey; details: HandoffDetails; createdAt: number }

const handoffs = new Map<string, Entry>()

export function createHandoff(userId: string, tool: ToolKey, details: HandoffDetails): string {
  const id = randomBytes(16).toString('base64url')
  handoffs.set(id, { userId, tool, details, createdAt: Date.now() })
  if (handoffs.size > MAX_ENTRIES) handoffs.delete(handoffs.keys().next().value!)
  return id
}

/// The details behind one id, for the account they were created for.
///
/// Not consumed on read: a teacher who reloads the page should see the same
/// filled-in form rather than an empty one. Expiry does the clearing.
export function readHandoff(id: string, userId: string): { tool: ToolKey; details: HandoffDetails } | null {
  const entry = handoffs.get(id)
  if (!entry) return null
  if (Date.now() - entry.createdAt > TTL_MS) {
    handoffs.delete(id)
    return null
  }
  // An id is unguessable, but it is still only an id — it must not hand one
  // teacher's class details to a different signed-in account.
  if (entry.userId !== userId) return null
  return { tool: entry.tool, details: entry.details }
}
