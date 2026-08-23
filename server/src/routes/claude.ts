import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'

export const claudeRouter = Router()

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const { role, content } = value as Record<string, unknown>
  return (role === 'user' || role === 'assistant') && typeof content === 'string'
}

// Generic proxy so the Anthropic API key never reaches the client. Feature
// routes (scenario generation, attempt feedback, Q&A) build their own
// system prompts and call this same underlying client directly rather than
// going through HTTP to themselves — this endpoint exists for any
// client-driven use case that doesn't warrant its own route.
claudeRouter.post('/messages', async (req, res) => {
  const { system, messages, maxTokens } = req.body ?? {}

  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isChatMessage)) {
    res.status(400).json({ error: 'messages must be a non-empty array of { role, content }' })
    return
  }
  if (system !== undefined && typeof system !== 'string') {
    res.status(400).json({ error: 'system must be a string' })
    return
  }
  if (maxTokens !== undefined && (typeof maxTokens !== 'number' || maxTokens <= 0 || maxTokens > 4096)) {
    res.status(400).json({ error: 'maxTokens must be a number between 1 and 4096' })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens ?? 1024,
      system,
      messages,
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    res.json({ content: text })
  } catch (error) {
    console.error('[claude] request failed:', error)
    res.status(502).json({ error: 'Claude request failed' })
  }
})
