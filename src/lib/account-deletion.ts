import { Prisma } from "@prisma/client";
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
 *
 * Re-signup with the same email IS allowed — once the account is deleted,
 * the email is freed (anonymized to deleted-${userId}@deleted.local), so a
 * fresh signup creates a new User row. The deletedAt-flagged row remains
 * permanently inaccessible via auth.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const anonymizedEmail = `deleted-${userId}@deleted.local`;

  // Capture identifiers before mutation. Read failures are non-fatal.
  const [subscription, currentUser] = await Promise.all([
    db.subscription.findUnique({ where: { userId } }).catch(() => null),
    db.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null),
  ]);
  const oldEmail = currentUser?.email ?? null;

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

    // 2. Drop profile child entities (Phase 1 expansion). The cascade FK
    //    only fires on profile deletion, but this is a SOFT delete that
    //    retains the profile row, so we must wipe children explicitly.
    //    Filter via `profile: { userId }` so we don't need a separate
    //    profileId lookup round-trip.
    const childWhere = { profile: { userId } };
    await tx.skill.deleteMany({ where: childWhere });
    await tx.workExperience.deleteMany({ where: childWhere });
    await tx.educationEntry.deleteMany({ where: childWhere });
    await tx.project.deleteMany({ where: childWhere });
    await tx.certification.deleteMany({ where: childWhere });
    await tx.spokenLanguage.deleteMany({ where: childWhere });

    // 3. Wipe UserProfile PII if profile exists. customAnswers needs the
    //    explicit JsonNull sentinel — a bare `null` or `undefined` is not
    //    a SQL-NULL write in Prisma's typed JSON field semantics.
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
        // Phase 5 — extended social links (10 fields).
        twitterUrl: null,
        stackOverflowUrl: null,
        dribbbleUrl: null,
        behanceUrl: null,
        mediumUrl: null,
        devToUrl: null,
        googleScholarUrl: null,
        huggingFaceUrl: null,
        kaggleUrl: null,
        youtubeUrl: null,
        headline: null,
        summary: null,
        resumeData: null,
        resumeUrl: null,
        resumeFileName: null,
        customAnswers: Prisma.JsonNull,
        // Phase 5 — application templates.
        coverLetterIntro: null,
        whyImLookingTemplate: null,
        // Phase 5 — job-search preferences (reset to schema defaults).
        noticePeriodWeeks: null,
        earliestStartDate: null,
        targetRoles: [],
        targetIndustries: [],
        companySizePreferences: [],
        relocationCities: [],
        desiredEmploymentTypes: [],
        eligibleCountries: [],
        relocationOpen: false,
        searchStatus: "open",
        securityClearance: "none",
        currencyPreference: "USD",
        // Phase 5 — compliance answers (nullable booleans + equity).
        hasDriversLicense: null,
        willingBackgroundCheck: null,
        willingDrugTest: null,
        equityImportance: null,
        isComplete: false,
      },
    });

    // 4. Drop OAuth account links — these hold refresh/access tokens (PII).
    await tx.account.deleteMany({ where: { userId } });

    // 5. Drop pending magic-link verification tokens for the old email.
    if (oldEmail) {
      await tx.verificationToken.deleteMany({ where: { identifier: oldEmail } });
    }

    // 6. Force sign-out everywhere — drop all sessions
    await tx.session.deleteMany({ where: { userId } });
  });

  // 7. Best-effort Stripe cancellation (outside the transaction so a Stripe
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
