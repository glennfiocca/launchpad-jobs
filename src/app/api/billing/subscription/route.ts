import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripe, getOrCreateStripeCustomer, STRIPE_PRICE_ID } from "@/lib/stripe";
import type { ApiResponse } from "@/types";


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
      metadata: { userId: session.user.id },
    });

    const invoiceId =
      typeof subscription.latest_invoice === "string"
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id;

    if (!invoiceId) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Subscription created but no invoice was generated" },
        { status: 500 }
      );
    }

    // In the 2026-03-25.dahlia API, the client_secret lives on the PaymentIntent
    // referenced by the invoice's default InvoicePayment object.
    const payments = await getStripe().invoicePayments.list({ invoice: invoiceId });
    const defaultPayment = payments.data.find((p) => p.is_default);

    const paymentIntentId =
      typeof defaultPayment?.payment.payment_intent === "string"
        ? defaultPayment.payment.payment_intent
        : defaultPayment?.payment.payment_intent?.id;

    if (!paymentIntentId) {
      console.error("No PaymentIntent found for invoice", invoiceId, "payments:", JSON.stringify(payments.data));
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Could not initialize payment. Please try again." },
        { status: 500 }
      );
    }

    const paymentIntent = await getStripe().paymentIntents.retrieve(paymentIntentId);
    const clientSecret = paymentIntent.client_secret;

    if (!clientSecret) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "Could not initialize payment. Please try again." },
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
