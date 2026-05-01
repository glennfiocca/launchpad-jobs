import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

/**
 * Soft-delete a user account (GDPR / CCPA).
 *
 * Aggregate records (applications, audit logs, notifications, emails) are
 * intentionally retained for analytics integrity. PII is anonymized and the
 * user's authentication state is invalidated.
 *
 * Stripe cancellation is best-effort and must NOT roll back local deletion.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const anonymizedEmail = `deleted-${userId}@deleted.local`;

  // Capture Stripe subscription ID before the transaction. Read failures here
  // are non-fatal — Stripe cancellation is best-effort.
  const subscription = await db.subscription
    .findUnique({ where: { userId } })
    .catch(() => null);

  await db.$transaction(async (tx) => {
    // 1. Anonymize the User row + flag deletedAt
    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        email: anonymizedEmail,
        name: null,
        image: null,
        password: null,
        normalizedEmail: null,
        referralCode: null,
        // stripeCustomerId intentionally preserved for Stripe ledger linkage
      },
    });

    // 2. Wipe UserProfile PII if profile exists
    await tx.userProfile.updateMany({
      where: { userId },
      data: {
        firstName: "",
        lastName: "",
        phone: null,
        location: null,
        locationPlaceId: null,
        locationFormatted: null,
        locationStreet: null,
        locationCity: null,
        locationState: null,
        locationPostalCode: null,
        locationLat: null,
        locationLng: null,
        linkedinUrl: null,
        githubUrl: null,
        portfolioUrl: null,
        headline: null,
        summary: null,
        resumeData: null,
        resumeUrl: null,
        resumeFileName: null,
        customAnswers: undefined,
        voluntaryGender: null,
        voluntaryRace: null,
        voluntaryVeteranStatus: null,
        voluntaryDisability: null,
        isComplete: false,
      },
    });

    // 3. Force sign-out everywhere — drop all sessions
    await tx.session.deleteMany({ where: { userId } });
  });

  // 4. Best-effort Stripe cancellation (outside the transaction so a Stripe
  //    failure cannot roll back the local anonymization).
  if (subscription?.stripeSubscriptionId) {
    try {
      await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      console.error(
        `[account-deletion] Stripe cancel failed for user=${userId} sub=${subscription.stripeSubscriptionId}:`,
        error
      );
    }
  }

  console.log(`[account-deletion] Soft-deleted user=${userId}`);
}
