import { loadStripe } from "@stripe/stripe-js"

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

if (!stripePublishableKey) {
  throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured")
}

export const stripePromise = loadStripe(stripePublishableKey)
