import type Anthropic from '@anthropic-ai/sdk'

// A system prompt sent as blocks rather than one string, so a cache breakpoint
// can sit between the stable half and the rest.
export type SystemPrompt = Anthropic.TextBlockParam[]

// Sonnet 5 will not cache a prefix under 1024 tokens. It fails silently — no
// error, just `cache_creation_input_tokens: 0` — so a prompt that drifts under
// the line stops caching without anything breaking.
//
// Measured 2026-09-29 with messages.count_tokens against claude-sonnet-5:
//
//   Ask, first response      2176-2345  (varies by focus area)
//   Reflect                  1541-1810  (typed vs spoken)
//   Talk It Through, app          1342
//   Ask, follow-up chat        948-1322  (varies by focus area — some too short)
//   Talk It Through, Telegram      847   (too short)
//
// The marker is applied regardless: below the minimum it does nothing and costs
// nothing, and Telegram's prompt starts caching for free if it ever grows past
// the line. But shortening one of the prompts above can silently switch caching
// off, so re-measure after editing one rather than trusting this list.
export const MIN_CACHEABLE_TOKENS = 1024

// Caching is a prefix match: every byte before the breakpoint must be identical
// across requests or nothing after it is reused. `stable` is therefore only the
// part that is the same for EVERY teacher on this surface — the frozen persona
// prose. The teacher's name, their room, their experience level, their memory
// and any per-request context all belong in `volatile`, after the breakpoint;
// one of them above it costs every cache hit on the surface, silently.
//
// Because `stable` is shared across all teachers, its cache entry stays warm on
// other teachers' traffic, not just the same teacher's next turn — which is
// what makes this worth doing on a 5-minute TTL.
export function cachedSystem(stable: string, volatile: string): SystemPrompt {
  const blocks: SystemPrompt = [{ type: 'text', text: stable, cache_control: { type: 'ephemeral' } }]
  if (volatile) blocks.push({ type: 'text', text: volatile })
  return blocks
}

// `cacheRead: 0` on a surface that should be caching is the only symptom of a
// prefix that drifted — logged on every coaching call so it shows up in Render's
// logs without anyone having to go looking.
export function cacheStats(usage: {
  input_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}) {
  return {
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    uncached: usage.input_tokens,
  }
}
