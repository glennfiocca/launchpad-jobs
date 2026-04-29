import type { NormalizedJob } from "../../types";
import type { AshbyApiJob } from "./types";

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
    applyUrl: ashbyJob.applyUrl || null,
    content: ashbyJob.descriptionHtml || null,
    postedAt: ashbyJob.publishedAt ? new Date(ashbyJob.publishedAt) : null,
    compensation: extractCompensation(ashbyJob),
  };
}
