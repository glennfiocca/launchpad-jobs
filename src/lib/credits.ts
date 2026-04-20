import { db } from "@/lib/db";

export const FREE_TIER_CREDITS = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export type CreditCheckResult =
  | { allowed: true }
  | { allowed: false; reason: "LIMIT_REACHED"; resetsAt: Date };

/**
 * Atomically check and consume one credit for a user.
 * Paid subscribers (ACTIVE) bypass the check entirely.
 * Referral credits are consumed before the rolling free-tier window.
 * Uses a transaction to prevent race conditions on concurrent requests.
 */
export async function checkAndConsumeCredit(
  userId: string
): Promise<CreditCheckResult> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })

    // 1. Pro users bypass all credit checks
    if (user.subscriptionStatus === "ACTIVE") {
      return { allowed: true }
    }

    // 2. Consume from referral credits first
    if (user.referralCredits > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { referralCredits: user.referralCredits - 1 },
      })
      return { allowed: true }
    }

    // 3. Rolling window check
    const now = new Date()
    const windowExpired =
      now.getTime() - user.creditWindowStart.getTime() >= WINDOW_MS

    const currentUsed = windowExpired ? 0 : user.creditsUsed
    const currentWindowStart = windowExpired ? now : user.creditWindowStart

    if (currentUsed >= FREE_TIER_CREDITS) {
      const resetsAt = new Date(currentWindowStart.getTime() + WINDOW_MS)
      return { allowed: false, reason: "LIMIT_REACHED", resetsAt }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        creditsUsed: currentUsed + 1,
        ...(windowExpired ? { creditWindowStart: now } : {}),
      },
    })

    return { allowed: true }
  })
}

export interface CreditStatus {
  isSubscribed: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  resetsAt: Date;
  referralCredits: number;
}

export async function getCreditStatus(userId: string): Promise<CreditStatus> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const now = new Date();
  const windowExpired =
    now.getTime() - user.creditWindowStart.getTime() >= WINDOW_MS;

  const creditsUsed = windowExpired ? 0 : user.creditsUsed;
  const resetsAt = windowExpired
    ? new Date(now.getTime() + WINDOW_MS)
    : new Date(user.creditWindowStart.getTime() + WINDOW_MS);

  return {
    isSubscribed: user.subscriptionStatus === "ACTIVE",
    creditsUsed,
    creditsRemaining: Math.max(0, FREE_TIER_CREDITS - creditsUsed),
    resetsAt,
    referralCredits: user.referralCredits,
  };
}
