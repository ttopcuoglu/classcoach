import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    '[anthropic] ANTHROPIC_API_KEY is not set — requests to /api/claude will fail. Add it to server/.env',
  )
}

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const CLAUDE_MODEL = 'claude-sonnet-5'
