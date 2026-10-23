import { Router } from 'express'
import { setTeacherChoice, teacherFocusList } from '../lib/schoolPriorities.ts'
import { isChoiceState } from '../lib/schoolPriorityRules.ts'

// A teacher's own view of their school's Coaching Priorities, and their own
// answers. Everything here is about the signed-in teacher only: there is no
// parameter that names another user. See docs/coaching-priorities.md.
export const schoolFocusRouter = Router()

schoolFocusRouter.get('/', async (req, res) => {
  const items = await teacherFocusList(req.user!.userId)
  res.json({ items })
})

schoolFocusRouter.put('/:priorityId', async (req, res) => {
  const state = req.body?.state
  if (!isChoiceState(state)) {
    res.status(400).json({ error: "state must be 'on', 'paused', 'off' or 'later'." })
    return
  }
  const ok = await setTeacherChoice(req.user!.userId, req.params.priorityId as string, state)
  if (!ok) {
    res.status(404).json({ error: 'That focus is not available.' })
    return
  }
  res.json({ items: await teacherFocusList(req.user!.userId) })
})
