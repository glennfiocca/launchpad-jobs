import { db } from "@/lib/db";
import type Stripe from "stripe";

export async function handleSubscriptionUpsert(
  sub: Stripe.Subscription
): Promise<void> {
  const userId = sub.metadata.userId;
  if (!userId) return;

  const isActive = sub.status === "active" || sub.status === "trialing";
  const status = isActive
    ? ("ACTIVE" as const)
    : sub.status === "past_due"
      ? ("PAST_DUE" as const)
      : ("CANCELED" as const);

  // current_period_end lives on the subscription object in older API versions;
  // in newer versions it's on each subscription item. Fall back gracefully.
  const rawPeriodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    0;
  const periodEnd = new Date(rawPeriodEnd * 1000);

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
        stripePriceId: sub.items.data[0]?.price.id ?? "",
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
      update: {
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items.data[0]?.price.id ?? "",
        stripeCurrentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    }),
  ]);
}

export async function handleSubscriptionDeleted(
  sub: Stripe.Subscription
): Promise<void> {
  const userId = sub.metadata.userId;
  if (!userId) return;

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { subscriptionStatus: "CANCELED" },
    }),
    db.subscription.deleteMany({ where: { userId } }),
  ]);
}

export async function handlePaymentFailed(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  await db.user.updateMany({
    where: { stripeCustomerId: customerId },
    data: { subscriptionStatus: "PAST_DUE" },
  });
}

export async function handlePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId || invoice.billing_reason !== "subscription_cycle") return;

  await db.user.updateMany({
    where: { stripeCustomerId: customerId, subscriptionStatus: "PAST_DUE" },
    data: { subscriptionStatus: "ACTIVE" },
  });
}
