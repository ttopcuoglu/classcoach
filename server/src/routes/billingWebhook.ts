import { Router } from 'express'
import type Stripe from 'stripe'
import { prisma } from '../lib/prisma.ts'
import { stripe } from '../lib/stripe.ts'

export const billingWebhookRouter = Router()

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

// Mounted in index.ts with express.raw(), before the global express.json()
// middleware — Stripe's signature check needs the untouched raw body, which
// a JSON-parsed request no longer has.
billingWebhookRouter.post('/', async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.error('[billing-webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting event')
    res.status(500).send('Webhook not configured')
    return
  }

  const signature = req.headers['stripe-signature']
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, WEBHOOK_SECRET)
  } catch (error) {
    console.error('[billing-webhook] signature verification failed:', error)
    res.status(400).send('Invalid signature')
    return
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        if (userId && customerId) {
          await prisma.user.update({
            where: { id: userId },
            data: { plan: 'plus', planStatus: 'active', stripeCustomerId: customerId },
          })
        }
        break
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        const periodEnd = subscription.items.data[0]?.current_period_end
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            planStatus: subscription.status,
            planRenewsAt: periodEnd ? new Date(periodEnd * 1000) : null,
          },
        })
        break
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { plan: 'free', planStatus: 'canceled' },
        })
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (customerId) {
          await prisma.organization.updateMany({
            where: { stripeCustomerId: customerId },
            data: { plan: 'district' },
          })
        }
        break
      }
      default:
        break
    }
    res.json({ received: true })
  } catch (error) {
    console.error(`[billing-webhook] failed to handle ${event.type}:`, error)
    res.status(500).json({ error: 'Webhook handler failed' })
  }
})
