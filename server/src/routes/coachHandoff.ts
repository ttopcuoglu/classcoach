// What Coach collected in a chat, for the tool it handed off to. Mounted
// behind requireAuth, and scoped to the signed-in teacher inside
// readHandoff — see lib/coachHandoff.ts for why this isn't a table.
import { Router } from 'express'
import { readHandoff } from '../lib/coachHandoff.ts'

export const coachHandoffRouter = Router()

coachHandoffRouter.get('/:id', (req, res) => {
  const handoff = readHandoff(req.params.id, req.user!.userId)
  if (!handoff) {
    // Expired, or from another account. Said as a fact with the way round
    // it, because from the teacher's side nothing is broken — the form in
    // front of them still works.
    res.status(404).json({ error: 'That was a while ago, so the details are gone. Fill the form in here and build it from this page.' })
    return
  }
  res.json(handoff)
})
