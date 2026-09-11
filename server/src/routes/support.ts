import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { SUPPORT_SYSTEM_PROMPT } from '../lib/supportKnowledge.ts'

export const supportRouter = Router()

// This is the only unauthenticated route in the app that costs money to
// serve, so it carries its own protection rather than leaning on
// checkAndLogUsage (which keys off a userId that does not exist here).
//
// Three independent ceilings, smallest first:
//   per-IP   — stops one visitor (or one script) from looping
//   global   — caps the worst possible day for the whole route
//   tokens   — caps the cost of any single answer
const PER_IP_PER_HOUR = Number(process.env.SUPPORT_CHAT_IP_HOURLY) || 20
const GLOBAL_PER_DAY = Number(process.env.SUPPORT_CHAT_DAILY) || 500
const MAX_TOKENS = 400
const MAX_MESSAGE_CHARS = 600
// Enough for a real back-and-forth, short enough that the prompt cost per
// turn stays flat instead of growing with the conversation.
const MAX_HISTORY_TURNS = 8

const EMAIL_FALLBACK = 'For anything I can’t answer, email hello@wivoza.com and a person will reply.'

// In-memory, per-process. Good enough for a single Render instance; if this
// ever runs on more than one, move both counters to the database.
const ipHits = new Map<string, number[]>()
let globalDay = ''
let globalCount = 0

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function underGlobalCap(): boolean {
  const today = todayKey()
  if (today !== globalDay) {
    globalDay = today
    globalCount = 0
  }
  return globalCount < GLOBAL_PER_DAY
}

function underIpCap(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - 60 * 60 * 1000
  const recent = (ipHits.get(ip) ?? []).filter((t) => t > cutoff)
  // Opportunistic cleanup so the map can't grow without bound.
  if (ipHits.size > 5000) {
    for (const [key, times] of ipHits) if (times.every((t) => t <= cutoff)) ipHits.delete(key)
  }
  ipHits.set(ip, recent)
  return recent.length < PER_IP_PER_HOUR
}

function record(ip: string): void {
  ipHits.set(ip, [...(ipHits.get(ip) ?? []), Date.now()])
  globalCount += 1
}

type Turn = { role: 'user' | 'assistant'; text: string }

supportRouter.post('/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message) {
    res.status(400).json({ error: 'message is required' })
    return
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    res.status(400).json({ error: `Please keep it under ${MAX_MESSAGE_CHARS} characters.` })
    return
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || 'unknown'

  if (!underGlobalCap()) {
    res.status(429).json({ reply: `We’ve hit today’s limit on the website assistant. ${EMAIL_FALLBACK}` })
    return
  }
  if (!underIpCap(ip)) {
    res.status(429).json({ reply: `That’s a lot of questions in one hour — thank you for the interest. ${EMAIL_FALLBACK}` })
    return
  }

  const history: Turn[] = Array.isArray(req.body?.history) ? req.body.history : []
  const messages = history
    .filter((t) => (t?.role === 'user' || t?.role === 'assistant') && typeof t?.text === 'string' && t.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.text.slice(0, MAX_MESSAGE_CHARS) }))

  record(ip)

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: SUPPORT_SYSTEM_PROMPT,
      messages: [...messages, { role: 'user' as const, content: message }],
    })
    const reply = response.content
      .filter((block): block is { type: 'text'; text: string; citations: never } => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()

    res.json({ reply: reply || `I’m not sure about that one. ${EMAIL_FALLBACK}` })
  } catch (err) {
    console.error('[support] chat failed', err)
    // Never leave the visitor at a dead end — the email is the fallback for
    // a Claude outage exactly as it is for a question we can't answer.
    res.status(502).json({ reply: `Sorry — I couldn’t answer just then. ${EMAIL_FALLBACK}` })
  }
})
