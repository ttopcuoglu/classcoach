import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    '[anthropic] ANTHROPIC_API_KEY is not set — requests to /api/claude will fail. Add it to server/.env',
  )
}

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const CLAUDE_MODEL = 'claude-sonnet-5'

/// The model for a SPOKEN reply, where the teacher is sitting in silence
/// waiting for it.
///
/// Measured on Talk It Through's own system prompt, six real teacher turns,
/// thinking disabled exactly as the route calls it: Haiku 5.5 reached its
/// first complete sentence in a median 663ms (569-850ms), against Sonnet 5's
/// 1147ms (805-1380ms). Nearly half a second, and far steadier — Haiku's
/// worst case beats Sonnet's best. Anthropic positions 5.5 for voice agents,
/// which is what this is.
///
/// Only the spoken path. Everything read on a screen stays on CLAUDE_MODEL,
/// where half a second buys nothing and the reply is worth more.
export const SPOKEN_MODEL = 'claude-haiku-5-5'
