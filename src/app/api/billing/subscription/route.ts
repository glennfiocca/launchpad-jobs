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

    let invoice = await getStripe().invoices.retrieve(invoiceId);

    // confirmation_secret is only present on a finalized invoice.
    // With default_incomplete, the invoice may still be in draft state.
    if (invoice.status === "draft") {
      invoice = await getStripe().invoices.finalizeInvoice(invoiceId);
    }

    const clientSecret = invoice.confirmation_secret?.client_secret ?? null;

    if (!clientSecret) {
      console.error("No client_secret found. Invoice status:", invoice.status, "confirmation_secret:", invoice.confirmation_secret);
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
