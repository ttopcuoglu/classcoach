// "Not right?" on a quote in Insights.
//
// Recorded and never acted on: a flagged quote stays on the page, because one
// teacher's flag is a judgement to review, not a verdict. The flags are the
// eval set for the reads that choose quotes, which is why each keeps the line
// it was about and the words exactly as shown.

/// Long enough for any quote Insights shows (30 words, or one whole line).
const MAX_QUOTE_CHARS = 1000
const MAX_REASON_CHARS = 500

export type QuoteFlagInput = {
  findingKey: string
  segmentId: string
  quote: string
  timestampSec: number
  reason: string | null
}

/// The body of a flag, or the reason it is refused. The caller still checks
/// the line belongs to the lesson: this only checks the shape.
export function parseQuoteFlag(body: unknown): QuoteFlagInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const { findingKey, segmentId, quote, timestampSec, reason } = b
  if (typeof findingKey !== 'string' || !/^[a-z_]{1,40}$/.test(findingKey)) return { error: 'findingKey is missing or malformed' }
  if (typeof segmentId !== 'string' || !segmentId || segmentId.length > 64) return { error: 'segmentId is missing' }
  if (typeof quote !== 'string' || !quote.trim() || quote.length > MAX_QUOTE_CHARS) return { error: 'quote is missing or too long' }
  if (typeof timestampSec !== 'number' || !Number.isFinite(timestampSec) || timestampSec < 0) return { error: 'timestampSec is missing' }
  if (reason != null && (typeof reason !== 'string' || reason.length > MAX_REASON_CHARS)) return { error: 'reason is too long' }
  return {
    findingKey,
    segmentId,
    quote: quote.trim(),
    timestampSec,
    reason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  }
}
