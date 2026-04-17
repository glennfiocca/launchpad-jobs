import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import Stripe from "stripe";
import { authOptions } from "@/lib/auth";
import { getStripe, getOrCreateStripeCustomer, STRIPE_PRICE_ID } from "@/lib/stripe";
import type { ApiResponse } from "@/types";

/** Stripe Invoice shape when `latest_invoice.payment_intent` is expanded. */
interface ExpandedInvoice extends Omit<Stripe.Invoice, "payment_intent"> {
  payment_intent: Stripe.PaymentIntent;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const customerId = await getOrCreateStripeCustomer(
      session.user.id,
      session.user.email
    );

    const subscription = await getStripe().subscriptions.create({
      customer: customerId,
      items: [{ price: STRIPE_PRICE_ID }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: { userId: session.user.id },
    });

    const invoice = subscription.latest_invoice as ExpandedInvoice | null;
    if (!invoice) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Subscription created but no invoice was generated" },
        { status: 500 }
      );
    }

    const clientSecret = invoice.payment_intent.client_secret;
    if (clientSecret === null) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Payment intent has no client secret" },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<{ clientSecret: string; subscriptionId: string }>>({
      success: true,
      data: { clientSecret, subscriptionId: subscription.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create subscription";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
