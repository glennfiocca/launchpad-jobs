import { loadStripe } from "@stripe/stripe-js"

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null

// Resolve to null if key is missing — Elements handles null stripe gracefully
export const stripePromise = key ? loadStripe(key) : Promise.resolve(null)
