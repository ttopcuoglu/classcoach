import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
if (!STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY is not set — billing routes will fail until it is added.')
}

export const stripe = new Stripe(STRIPE_SECRET_KEY ?? '')
