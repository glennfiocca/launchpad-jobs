import { db } from "@/lib/db";
import { z } from "zod";
import type Stripe from "stripe";
import type { SubscriptionStatus } from "@prisma/client";

/**
 * Stripe webhook handlers.
 *
 * Hardened guarantees:
 * - Every handler validates its event slice with Zod before reading fields.
 * - Handlers prefer the Stripe `customer` id → DB lookup over `metadata.userId`
 *   when both are available (more robust against missing/stale metadata).
 * - On validation failure handlers throw so the webhook entrypoint can return
 *   a 4xx and we never silently update the DB with empty defaults.
 * - All writes are idempotent: re-applying the same event yields the same
 *   final state.
 * - Each handler logs start + outcome with `[stripe-webhook]` prefix.
 */

const LOG_PREFIX = "[stripe-webhook]";

/** Custom error so the route can map handler failures to HTTP 400. */
export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

// ---------------------------------------------------------------------------
// Zod schemas — only the fields the handlers actually read.
// ---------------------------------------------------------------------------

const stripeIdString = z.string().min(1);

/** Stripe customer field can be a string id, an expanded object, or null. */
const customerField = z.union([
  stripeIdString,
  z.object({ id: stripeIdString }),
  z.null(),
  z.undefined(),
]);

const subscriptionItemSchema = z.object({
  price: z.object({ id: stripeIdString }),
  current_period_end: z.number().int().positive().optional(),
});

const subscriptionEventSchema = z.object({
  id: stripeIdString,
  status: z.string().min(1),
  customer: customerField,
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.string(), z.string()).optional().default({}),
  items: z.object({
    data: z.array(subscriptionItemSchema).min(1),
  }),
  // older API versions
  current_period_end: z.number().int().positive().optional(),
});

const invoiceEventSchema = z.object({
  id: stripeIdString,
  customer: customerField,
  billing_reason: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCustomerId(
  customer: z.infer<typeof customerField>
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Resolve the User.id this event applies to.
 *
 * Strategy:
 *   1. Prefer Stripe `customer` id → DB lookup (robust, survives metadata
 *      loss between Stripe objects).
 *   2. Fall back to `metadata.userId` and verify the user exists.
 *
 * Returns null when neither yields a known user.
 */
async function resolveUserId(
  customerId: string | null,
  metadataUserId: string | undefined
): Promise<string | null> {
  if (customerId) {
    const user = await db.user.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (user) return user.id;
  }

  if (metadataUserId) {
    const user = await db.user.findUnique({
      where: { id: metadataUserId },
      select: { id: true },
    });
    if (user) return user.id;
  }

  return null;
}

function mapStripeStatusToInternal(
  stripeStatus: string
): SubscriptionStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "ACTIVE";
  if (stripeStatus === "past_due") return "PAST_DUE";
  return "CANCELED";
}

/**
 * Stripe moved `current_period_end` from the subscription object onto each
 * subscription item in newer API versions. Read whichever is present.
 */
function extractPeriodEnd(
  parsed: z.infer<typeof subscriptionEventSchema>
): Date | null {
  const fromItem = parsed.items.data[0]?.current_period_end;
  const fromSub = parsed.current_period_end;
  const seconds = fromItem ?? fromSub;
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle `customer.subscription.created` and `customer.subscription.updated`.
 *
 * Returns true if a write occurred, false if the event was a no-op (state
 * already matched). Throws WebhookValidationError on malformed payloads.
 */
export async function handleSubscriptionUpsert(
  rawSub: Stripe.Subscription,
  eventId: string
): Promise<boolean> {
  console.info(`${LOG_PREFIX} subscription.upsert ${eventId} start`);

  const parseResult = subscriptionEventSchema.safeParse(rawSub);
  if (!parseResult.success) {
    console.error(
      `${LOG_PREFIX} subscription.upsert ${eventId} invalid payload`,
      parseResult.error.flatten()
    );
    throw new WebhookValidationError(
      "Invalid subscription payload: " + parseResult.error.message
    );
  }
  const sub = parseResult.data;

  const customerId = extractCustomerId(sub.customer);
  const userId = await resolveUserId(customerId, sub.metadata.userId);
  if (!userId) {
    console.error(
      `${LOG_PREFIX} subscription.upsert ${eventId} no user resolved (customer=${customerId ?? "null"}, metadata.userId=${sub.metadata.userId ?? "null"})`
    );
    throw new WebhookValidationError(
      "Cannot resolve userId from event (no matching customer or metadata.userId)"
    );
  }

  const priceId = sub.items.data[0].price.id;
  const periodEnd = extractPeriodEnd(sub);
  if (!periodEnd) {
    console.error(
      `${LOG_PREFIX} subscription.upsert ${eventId} missing current_period_end`
    );
    throw new WebhookValidationError(
      "Subscription event missing current_period_end"
    );
  }

  const status = mapStripeStatusToInternal(sub.status);

  // Idempotency: read current state and skip the write if nothing changed.
  const [currentUser, currentSub] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    }),
    db.subscription.findUnique({ where: { userId } }),
  ]);

  const userStateMatches = currentUser?.subscriptionStatus === status;
  const subStateMatches =
    currentSub !== null &&
    currentSub.stripeSubscriptionId === sub.id &&
    currentSub.stripePriceId === priceId &&
    currentSub.stripeCurrentPeriodEnd.getTime() === periodEnd.getTime() &&
    currentSub.cancelAtPeriodEnd === sub.cancel_at_period_end;

  if (userStateMatches && subStateMatches) {
    console.info(
      `${LOG_PREFIX} subscription.upsert ${eventId} no-op (state already matches)`
    );
    return false;
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { subscriptionStatus: status },
    }),
    db.subscription.upsert({
      where: { userId },
      create: {
        userId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
      update: {
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    }),
  ]);

  console.info(
    `${LOG_PREFIX} subscription.upsert ${eventId} ok userId=${userId} status=${status}`
  );
  return true;
}

/**
 * Handle `customer.subscription.deleted`.
 *
 * Returns true on write, false if user already in CANCELED state with no
 * Subscription row. Throws WebhookValidationError on malformed payloads.
 */
export async function handleSubscriptionDeleted(
  rawSub: Stripe.Subscription,
  eventId: string
): Promise<boolean> {
  console.info(`${LOG_PREFIX} subscription.deleted ${eventId} start`);

  const parseResult = subscriptionEventSchema.safeParse(rawSub);
  if (!parseResult.success) {
    console.error(
      `${LOG_PREFIX} subscription.deleted ${eventId} invalid payload`,
      parseResult.error.flatten()
    );
    throw new WebhookValidationError(
      "Invalid subscription payload: " + parseResult.error.message
    );
  }
  const sub = parseResult.data;

  const customerId = extractCustomerId(sub.customer);
  const userId = await resolveUserId(customerId, sub.metadata.userId);
  if (!userId) {
    console.error(
      `${LOG_PREFIX} subscription.deleted ${eventId} no user resolved`
    );
    throw new WebhookValidationError(
      "Cannot resolve userId from event (no matching customer or metadata.userId)"
    );
  }

  // Idempotency: skip writes if user is already CANCELED and Subscription
  // row is gone.
  const [currentUser, existingSub] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true },
    }),
    db.subscription.findUnique({ where: { userId } }),
  ]);

  if (currentUser?.subscriptionStatus === "CANCELED" && existingSub === null) {
    console.info(
      `${LOG_PREFIX} subscription.deleted ${eventId} no-op (already canceled)`
    );
    return false;
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { subscriptionStatus: "CANCELED" },
    }),
    db.subscription.deleteMany({ where: { userId } }),
  ]);

  console.info(
    `${LOG_PREFIX} subscription.deleted ${eventId} ok userId=${userId}`
  );
  return true;
}

/**
 * Handle `invoice.payment_failed`.
 * Marks all users matching the customer as PAST_DUE.
 */
export async function handlePaymentFailed(
  rawInvoice: Stripe.Invoice,
  eventId: string
): Promise<boolean> {
  console.info(`${LOG_PREFIX} payment_failed ${eventId} start`);

  const parseResult = invoiceEventSchema.safeParse(rawInvoice);
  if (!parseResult.success) {
    console.error(
      `${LOG_PREFIX} payment_failed ${eventId} invalid payload`,
      parseResult.error.flatten()
    );
    throw new WebhookValidationError(
      "Invalid invoice payload: " + parseResult.error.message
    );
  }
  const invoice = parseResult.data;

  const customerId = extractCustomerId(invoice.customer);
  if (!customerId) {
    console.error(`${LOG_PREFIX} payment_failed ${eventId} missing customer`);
    throw new WebhookValidationError("Invoice missing customer id");
  }

  // Idempotency: count rows that need updating; if none, skip.
  const candidates = await db.user.findMany({
    where: { stripeCustomerId: customerId },
    select: { id: true, subscriptionStatus: true },
  });

  const toUpdate = candidates.filter((u) => u.subscriptionStatus !== "PAST_DUE");
  if (toUpdate.length === 0) {
    console.info(
      `${LOG_PREFIX} payment_failed ${eventId} no-op (no users or already PAST_DUE)`
    );
    return false;
  }

  await db.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: "PAST_DUE" },
  });

  console.info(
    `${LOG_PREFIX} payment_failed ${eventId} ok customerId=${customerId} updated=${toUpdate.length}`
  );
  return true;
}

/**
 * Handle `invoice.payment_succeeded`.
 *
 * Only flips PAST_DUE → ACTIVE on subscription_cycle invoices (so the first
 * checkout invoice doesn't override the explicit subscription.created flow).
 */
export async function handlePaymentSucceeded(
  rawInvoice: Stripe.Invoice,
  eventId: string
): Promise<boolean> {
  console.info(`${LOG_PREFIX} payment_succeeded ${eventId} start`);

  const parseResult = invoiceEventSchema.safeParse(rawInvoice);
  if (!parseResult.success) {
    console.error(
      `${LOG_PREFIX} payment_succeeded ${eventId} invalid payload`,
      parseResult.error.flatten()
    );
    throw new WebhookValidationError(
      "Invalid invoice payload: " + parseResult.error.message
    );
  }
  const invoice = parseResult.data;

  const customerId = extractCustomerId(invoice.customer);
  if (!customerId) {
    console.error(
      `${LOG_PREFIX} payment_succeeded ${eventId} missing customer`
    );
    throw new WebhookValidationError("Invoice missing customer id");
  }

  if (invoice.billing_reason !== "subscription_cycle") {
    console.info(
      `${LOG_PREFIX} payment_succeeded ${eventId} skip (billing_reason=${invoice.billing_reason ?? "null"})`
    );
    return false;
  }

  // Idempotency: only update if there's a PAST_DUE user for this customer.
  const candidates = await db.user.findMany({
    where: { stripeCustomerId: customerId, subscriptionStatus: "PAST_DUE" },
    select: { id: true },
  });
  if (candidates.length === 0) {
    console.info(
      `${LOG_PREFIX} payment_succeeded ${eventId} no-op (no PAST_DUE users)`
    );
    return false;
  }

  await db.user.updateMany({
    where: { stripeCustomerId: customerId, subscriptionStatus: "PAST_DUE" },
    data: { subscriptionStatus: "ACTIVE" },
  });

  console.info(
    `${LOG_PREFIX} payment_succeeded ${eventId} ok customerId=${customerId} updated=${candidates.length}`
  );
  return true;
}
