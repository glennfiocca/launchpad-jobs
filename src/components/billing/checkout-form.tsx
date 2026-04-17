"use client"

import { useState } from "react"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import type { StripePaymentElementOptions } from "@stripe/stripe-js"
import { stripePromise } from "@/lib/stripe-client"

interface CheckoutFormProps {
  clientSecret: string
  onSuccess: () => void
  onCancel: () => void
}

const paymentElementOptions: StripePaymentElementOptions = {
  layout: "tabs",
}

function CheckoutFormInner({
  onSuccess,
  onCancel,
}: Pick<CheckoutFormProps, "onSuccess" | "onCancel">) {
  const stripe = useStripe()
  const elements = useElements()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isLoading = !stripe || !elements

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!stripe || !elements) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/billing?success=true",
        },
        redirect: "if_required",
      })

      if (result.error) {
        setErrorMessage(result.error.message ?? "Payment failed. Please try again.")
        setIsSubmitting(false)
      } else {
        onSuccess()
      }
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.")
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-white/10 bg-zinc-900 p-4">
        <PaymentElement options={paymentElementOptions} />
      </div>

      {errorMessage && (
        <p className="text-sm text-red-400 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading || isSubmitting}
        className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {isLoading || isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {isSubmitting ? "Processing..." : "Loading..."}
          </span>
        ) : (
          "Subscribe — $24.99/mo"
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full text-sm text-zinc-400 hover:text-white transition-colors"
      >
        Cancel
      </button>
    </form>
  )
}

export function CheckoutForm({
  clientSecret,
  onSuccess,
  onCancel,
}: CheckoutFormProps) {
  return (
    <div className="py-10 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-1 text-center">
        Upgrade to Pro
      </h2>
      <p className="text-sm text-zinc-500 mb-8 text-center">
        Unlimited job applications for $24.99/mo. Cancel any time.
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance: { theme: "night" } }}
        >
          <CheckoutFormInner onSuccess={onSuccess} onCancel={onCancel} />
        </Elements>
      </div>
    </div>
  )
}
