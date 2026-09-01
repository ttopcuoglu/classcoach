import { Router } from 'express'
import { prisma } from '../lib/prisma.ts'
import { stripe } from '../lib/stripe.ts'

export const billingRouter = Router()

const PLUS_PRICE_ID = process.env.STRIPE_PLUS_PRICE_ID
const FRONTEND_URL = (process.env.FRONTEND_ORIGINS ?? '').split(',')[0]?.trim() || 'http://localhost:5173'

billingRouter.post('/checkout', async (req, res) => {
  if (!PLUS_PRICE_ID) {
    res.status(500).json({ error: 'Billing is not configured yet. Please try again later.' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user) {
    res.status(401).json({ error: 'Not signed in' })
    return
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: PLUS_PRICE_ID, quantity: 1 }],
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      client_reference_id: user.id,
      success_url: `${FRONTEND_URL}/profile?upgraded=true`,
      cancel_url: `${FRONTEND_URL}/profile`,
    })
    if (!session.url) {
      res.status(502).json({ error: 'Could not start checkout. Please try again.' })
      return
    }
    res.json({ url: session.url })
  } catch (error) {
    console.error('[billing] checkout session creation failed:', error)
    res.status(502).json({ error: 'Could not start checkout. Please try again.' })
  }
})

billingRouter.post('/portal', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user?.stripeCustomerId) {
    res.status(400).json({ error: 'No billing account found for this user yet.' })
    return
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${FRONTEND_URL}/profile`,
    })
    res.json({ url: session.url })
  } catch (error) {
    console.error('[billing] portal session creation failed:', error)
    res.status(502).json({ error: 'Could not open billing management. Please try again.' })
  }
})
