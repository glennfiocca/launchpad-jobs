import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getCreditStatus } from "@/lib/credits";
import { db } from "@/lib/db";
import { BillingClient } from "@/components/billing/billing-client";

export const metadata = { title: "Billing — Pipeline" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const justUpgraded = params.success === "true";

  const [creditStatus, user] = await Promise.all([
    getCreditStatus(session.user.id),
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        subscriptionStatus: true,
        subscription: {
          select: {
            stripeCurrentPeriodEnd: true,
            cancelAtPeriodEnd: true,
          },
        },
      },
    }),
  ]);

  return (
    <BillingClient
      creditStatus={{
        ...creditStatus,
        resetsAt: creditStatus.resetsAt.toISOString(),
      }}
      subscriptionStatus={user?.subscriptionStatus ?? "FREE"}
      periodEnd={user?.subscription?.stripeCurrentPeriodEnd?.toISOString() ?? null}
      cancelAtPeriodEnd={user?.subscription?.cancelAtPeriodEnd ?? false}
      justUpgraded={justUpgraded}
    />
  );
}
