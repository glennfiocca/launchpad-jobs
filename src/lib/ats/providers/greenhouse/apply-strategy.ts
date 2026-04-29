import type { AtsProvider } from "@prisma/client";
import type { AtsApplyStrategy, AtsApplyOptions, AtsApplyResult } from "../../types";
import { applyToGreenhouseJob } from "@/lib/greenhouse/playwright-apply";
import type { UserProfile } from "@prisma/client";

/**
 * Greenhouse apply strategy adapter.
 * Bridges AtsApplyOptions to the existing applyToGreenhouseJob Playwright function.
 *
 * The Playwright apply function expects a full UserProfile. We build a shim
 * containing only the fields the apply function actually reads, then cast
 * through unknown to satisfy the type system.
 */
export class GreenhouseApplyStrategy implements AtsApplyStrategy {
  readonly provider: AtsProvider = "GREENHOUSE";

  async apply(options: AtsApplyOptions): Promise<AtsApplyResult> {
    // Build a partial UserProfile shim with the fields applyToGreenhouseJob uses.
    // Prisma model uses `linkedinUrl` (lowercase i) and `portfolioUrl`.
    const profileShim = {
      firstName: options.profile.firstName,
      lastName: options.profile.lastName,
      email: options.profile.email,
      phone: options.profile.phone,
      location: options.profile.location,
      linkedinUrl: options.profile.linkedInUrl,
      githubUrl: options.profile.githubUrl,
      portfolioUrl: options.profile.websiteUrl,
      preferredFirstName: options.profile.preferredFirstName ?? null,
    } as unknown as UserProfile;

    const result = await applyToGreenhouseJob({
      boardToken: options.boardToken,
      jobId: options.jobExternalId,
      profile: profileShim,
      trackingEmail: options.trackingEmail,
      resumeBuffer: options.resumeBuffer,
      resumeFileName: options.resumeFileName,
      coverLetter: options.coverLetter,
      questionAnswers: options.questionAnswers,
      preferredFirstName: options.profile.preferredFirstName ?? undefined,
    });

    return {
      success: result.success,
      applicationId: result.applicationId,
      errorCode: result.errorCode,
      error: result.error,
      manualApplyUrl: result.manualApplyUrl,
    };
  }
}
