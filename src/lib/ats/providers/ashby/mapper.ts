import type { NormalizedJob } from "../../types";
import type { AshbyApiJob } from "./types";
import { classifyLocation } from "@/lib/location-classifier";

/** Maps Ashby employmentType values to user-friendly strings. */
function mapEmploymentType(ashbyType: string): string {
  const mapping: Record<string, string> = {
    FullTime: "Full-time",
    PartTime: "Part-time",
    Intern: "Internship",
    Contract: "Contract",
    Temporary: "Temporary",
  };
  return mapping[ashbyType] ?? ashbyType;
}

/**
 * Extracts compensation from the first Salary component of the first tier,
 * if present. Returns undefined when no compensation data exists.
 */
function extractCompensation(
  job: AshbyApiJob
): NormalizedJob["compensation"] | undefined {
  if (!job.compensation) return undefined;

  const tiers = job.compensation.compensationTiers;
  if (tiers.length === 0) return undefined;

  const salaryComponent = tiers[0].components.find(
    (c) => c.compensationType === "Salary"
  );
  if (!salaryComponent) return undefined;

  return {
    min: salaryComponent.minValue,
    max: salaryComponent.maxValue,
    currency: salaryComponent.currencyCode,
  };
}

/** Converts a raw Ashby job to the normalized shape. */
export function mapAshbyJobToNormalized(ashbyJob: AshbyApiJob): NormalizedJob {
  const classification = classifyLocation({
    location: ashbyJob.location || null,
    remote: ashbyJob.isRemote ?? false,
    ashbyAddressCountry: ashbyJob.address?.postalAddress?.addressCountry ?? null,
    ashbySecondaryLocations: (ashbyJob.secondaryLocations ?? []).map((s) => s.location),
  });

  return {
    externalId: ashbyJob.id,
    title: ashbyJob.title,
    location: ashbyJob.location || null,
    department: ashbyJob.department || ashbyJob.team || null,
    employmentType: ashbyJob.employmentType
      ? mapEmploymentType(ashbyJob.employmentType)
      : null,
    remote: ashbyJob.isRemote ?? false,
    absoluteUrl: ashbyJob.jobUrl || null,
    // applyUrl is intentionally left null here. The Ashby Posting API returns
    // `https://jobs.ashbyhq.com/{board}/{uuid}/application` for every job —
    // for self-hosters that URL renders an empty SPA shell. The client's
    // getJobs() re-derives both URLs together (see client.ts) using the same
    // slug/fallback resolution, so applyUrl is set in lockstep with
    // absoluteUrl. For hosted (non-self-hoster) Ashby companies, applyUrl
    // stays null and the Playwright caller falls back to the canonical
    // jobs.ashbyhq.com URL pattern (see src/app/api/applications/route.ts).
    applyUrl: null,
    content: ashbyJob.descriptionHtml || null,
    postedAt: ashbyJob.publishedAt ? new Date(ashbyJob.publishedAt) : null,
    compensation: extractCompensation(ashbyJob),
    countryCode: classification.countryCode,
    locationCategory: classification.category,
    isUSEligible: classification.isUSEligible,
  };
}
