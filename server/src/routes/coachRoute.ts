// POST /api/coach/route — the box on Home.
//
// One sentence from a teacher who has not chosen a tool, one short answer
// and one door. See lib/coachRoute.ts for why this is a single turn and why
// talk_it_through is a key here but not in Telegram.
import { Router } from 'express'
import { anthropic, CLAUDE_MODEL } from '../lib/anthropic.ts'
import { PLAN_USER_SELECT } from '../lib/billing.ts'
import { prefillTarget } from '../lib/betterTool.ts'
import { createHandoff } from '../lib/coachHandoff.ts'
import { HOME_ROUTER_PROMPT, readHomeRoute } from '../lib/coachRoute.ts'
import { flagIfUnsafe } from '../lib/coachSafetyCheck.ts'
import { trimIfTruncated } from '../lib/coachStream.ts'
import { prisma } from '../lib/prisma.ts'
import { cachedSystem } from '../lib/promptCache.ts'
import { buildRoomContextBlock } from '../lib/teachingContext.ts'
import { checkUsage, logUsage } from '../lib/usageLimit.ts'

export const coachRouteRouter = Router()

// Two sentences and a details block. Generous enough that a prefill is
// never the thing that gets cut off, small enough that a model which
// decides to write an essay here is stopped rather than billed for it.
const MAX_TOKENS = 500

// Longer than this is not a teacher looking for a door — it is a teacher
// who should be in Talk It Through, and the UI points them there anyway.
const MAX_INPUT_CHARS = 1000

// Said as a fact. Nothing is broken from where the teacher is standing:
// every tool in the sidebar still works, and saying so is more use than an
// apology.
const ERROR_TEXT = 'Something went wrong finding the right place for that. The tools in the sidebar all still work.'

coachRouteRouter.post('/route', async (req, res) => {
  const userId = req.user!.userId
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) {
    res.status(400).json({ error: 'Say what you need help with.' })
    return
  }
  if (text.length > MAX_INPUT_CHARS) {
    res.status(400).json({ error: 'That is a lot for one line — Talk It Through is the better place for it.' })
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PLAN_USER_SELECT, gradeLevels: true, subjects: true },
  })
  if (!user) {
    res.status(404).json({ error: 'Account not found.' })
    return
  }

  const denied = await checkUsage(userId, 'coach_route', user)
  if (denied) {
    res.status(429).json({ error: denied })
    return
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      // The prompt is identical for every teacher on this surface, so its
      // cache entry stays warm on other teachers' traffic. Only the room
      // block is per-teacher, and it sits after the breakpoint.
      system: cachedSystem(HOME_ROUTER_PROMPT, buildRoomContextBlock(user.gradeLevels, user.subjects)),
      messages: [{ role: 'user', content: text }],
    })

    const raw = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    flagIfUnsafe(raw, 'home.route')

    const read = readHomeRoute(raw)
    let reply = trimIfTruncated(read.text, response.stop_reason)
    // Claude sometimes answers with the tag and nothing else — seen on
    // "is this chatbot-proof", where the door apparently said it all. The
    // offer IS the substance of that answer, so one line carries it rather
    // than the teacher getting an error on a question that worked.
    if (!reply && read.offer) reply = 'Here you go.'
    if (!reply) {
      res.status(502).json({ error: ERROR_TEXT })
      return
    }

    // The details never travel in the URL — browser history and proxy logs
    // are no place for a teacher's own words about their class. Only an
    // opaque id does, and coach-handoff hands the rest over once, to the
    // account it belongs to.
    let offer = read.offer
    if (offer && read.details && offer.key !== 'talk_it_through') {
      const target = prefillTarget(read.details)
      if (target) {
        const id = createHandoff(userId, offer.key, read.details)
        // `build=1` only when the lesson's length came from the teacher.
        // A button that says "Build this lesson" must build; a form with a
        // guessed period must not. See HOME_DURATION_RULE.
        const knowsLength = !('topic' in read.details) || read.details.durationMinutes != null
        const join = target.path.includes('?') ? '&' : '?'
        offer = {
          key: offer.key,
          label: knowsLength ? target.label : offer.label,
          path: `${target.path}${join}handoff=${id}${knowsLength ? '&build=1' : ''}`,
        }
      }
    }

    // Logged after the call succeeds: a teacher whose question errored out
    // should not have it counted against their month.
    void logUsage(userId, 'coach_route')
    res.json({ reply, offer })
  } catch (error) {
    console.error('[coach-route] could not answer:', error)
    res.status(502).json({ error: ERROR_TEXT })
  }
})
