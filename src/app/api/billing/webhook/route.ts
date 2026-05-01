import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  handleSubscriptionUpsert,
  handleSubscriptionDeleted,
  handlePaymentFailed,
  handlePaymentSucceeded,
  WebhookValidationError,
} from "@/lib/billing-handlers";
import type Stripe from "stripe";

export const runtime = "nodejs";

const LOG_PREFIX = "[stripe-webhook]";

/**
 * Stripe webhook entrypoint.
 *
 * Response codes — important for Stripe retry behavior:
 *   - 200: success or unhandled event type (we don't want Stripe to retry
 *     events we don't care about)
 *   - 400: signature failure or validation error (Stripe will retry briefly
 *     then give up; correct behavior — malformed events shouldn't apply)
 *   - 500: unexpected handler failure (Stripe will retry; we want that)
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Next.js App Router gives us a stream — we MUST read the raw body as text
  // before passing it to constructEvent, otherwise the signature won't match.
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    console.error(`${LOG_PREFIX} missing stripe-signature header`);
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(`${LOG_PREFIX} STRIPE_WEBHOOK_SECRET not configured`);
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(
      `${LOG_PREFIX} signature verification failed:`,
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  console.info(`${LOG_PREFIX} ${event.type} ${event.id} received`);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(
          event.data.object as Stripe.Subscription,
          event.id
        );
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          event.id
        );
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(
          event.data.object as Stripe.Invoice,
          event.id
        );
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(
          event.data.object as Stripe.Invoice,
          event.id
        );
        break;
      default:
        // Return 200 for unhandled event types so Stripe stops retrying.
        console.info(
          `${LOG_PREFIX} ${event.type} ${event.id} unhandled (acked)`
        );
        return NextResponse.json({ received: true, handled: false });
    }
  } catch (err) {
    if (err instanceof WebhookValidationError) {
      // Malformed event — return 400. Stripe will retry briefly then give up,
      // which is the right behavior: we don't want to apply garbage data.
      console.error(
        `${LOG_PREFIX} ${event.type} ${event.id} validation failed: ${err.message}`
      );
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // Unexpected error — return 500 so Stripe retries.
    console.error(
      `${LOG_PREFIX} ${event.type} ${event.id} handler error:`,
      err
    );
    return NextResponse.json(
      { error: "Handler error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, handled: true });
}
