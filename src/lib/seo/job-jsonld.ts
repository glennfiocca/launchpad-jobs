import type { JobWithCompany } from "@/lib/jobs/get-job";
import { VALIDITY_WINDOW_DAYS } from "@/config/seo";

// Schema.org JobPosting types (subset we emit). See:
// https://developers.google.com/search/docs/appearance/structured-data/job-posting

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACTOR"
  | "TEMPORARY"
  | "INTERN"
  | "VOLUNTEER"
  | "PER_DIEM"
  | "OTHER";

export interface PostalAddress {
  "@type": "PostalAddress";
  addressLocality?: string;
  addressRegion?: string;
  addressCountry?: string;
}

export interface Place {
  "@type": "Place";
  address: PostalAddress;
}

export interface Organization {
  "@type": "Organization";
  name: string;
  sameAs?: string;
  logo?: string;
}

export interface MonetaryAmount {
  "@type": "MonetaryAmount";
  currency: string;
  value: {
    "@type": "QuantitativeValue";
    minValue: number;
    maxValue: number;
    unitText: "YEAR";
  };
}

export interface Country {
  "@type": "Country";
  name: string;
}

export interface PropertyValue {
  "@type": "PropertyValue";
  name: string;
  value: string;
}

export interface JobPostingSchema {
  "@context": "https://schema.org/";
  "@type": "JobPosting";
  title: string;
  description: string;
  datePosted: string;
  hiringOrganization: Organization;
  jobLocation?: Place;
  validThrough?: string;
  employmentType?: EmploymentType;
  baseSalary?: MonetaryAmount;
  jobLocationType?: "TELECOMMUTE";
  applicantLocationRequirements?: Country;
  directApply?: boolean;
  identifier?: PropertyValue;
}

const MS_PER_DAY = 86_400_000;

// Map Greenhouse/Ashby employment-type strings to schema.org enum values.
// Match is case-insensitive and tolerates punctuation/whitespace variants
// ("Full-time" vs "Full Time" etc).
const EMPLOYMENT_TYPE_MAP: ReadonlyArray<readonly [RegExp, EmploymentType]> = [
  [/^full[\s-]?time$/i, "FULL_TIME"],
  [/^part[\s-]?time$/i, "PART_TIME"],
  [/^contract(or)?$/i, "CONTRACTOR"],
  [/^temp(orary)?$/i, "TEMPORARY"],
  [/^intern(ship)?$/i, "INTERN"],
  [/^volunteer$/i, "VOLUNTEER"],
  [/^per[\s-]?diem$/i, "PER_DIEM"],
  [/^other$/i, "OTHER"],
];

function mapEmploymentType(raw: string | null | undefined): EmploymentType {
  if (!raw) return "FULL_TIME";
  const trimmed = raw.trim();
  for (const [pattern, type] of EMPLOYMENT_TYPE_MAP) {
    if (pattern.test(trimmed)) return type;
  }
  return "FULL_TIME";
}

// Best-effort parse of a free-form location string ("City, ST" / "City, Country" / "Remote").
// Returns null when nothing usable can be extracted (callers should omit the
// `jobLocation` block entirely in that case).
function parseLocation(raw: string | null | undefined): PostalAddress | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // "Remote", "Anywhere", etc. — don't pretend we have a real city.
  if (/^remote$/i.test(trimmed) || /^anywhere$/i.test(trimmed)) return null;

  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0) return null;

  if (parts.length === 1) {
    return { "@type": "PostalAddress", addressLocality: parts[0] };
  }

  // "City, ST" — second token is a 2-letter US state abbreviation
  const last = parts[parts.length - 1];
  const isUsStateAbbr = /^[A-Z]{2}$/.test(last);

  if (isUsStateAbbr) {
    return {
      "@type": "PostalAddress",
      addressLocality: parts[0],
      addressRegion: last,
      addressCountry: "US",
    };
  }

  // "City, Country" / "City, Region, Country" — last segment treated as country
  return {
    "@type": "PostalAddress",
    addressLocality: parts[0],
    addressCountry: last,
  };
}

// Strip keys whose value is `undefined` so the emitted JSON-LD is clean.
// Shallow only — the nested objects we build never contain undefined values.
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Build a schema.org JobPosting object for the given job.
 * Pure function — no IO, safe to call inside `generateMetadata` and during render.
 */
export function buildJobPostingJsonLd(job: JobWithCompany): JobPostingSchema {
  const { company } = job;

  const description =
    job.content && job.content.length > 0
      ? job.content
      : `${job.title} at ${company.name}`;

  // datePosted: date-only ISO format (YYYY-MM-DD) per Google's spec.
  const postedDate = job.postedAt ?? job.createdAt;
  const datePosted = postedDate.toISOString().split("T")[0];

  const hiringOrganization: Organization = stripUndefined({
    "@type": "Organization" as const,
    name: company.name,
    sameAs: company.website ?? undefined,
    logo: company.logoUrl ?? undefined,
  });

  // jobLocation vs jobLocationType: when the job is remote OR has no parseable
  // location, prefer jobLocationType=TELECOMMUTE + applicantLocationRequirements.
  const parsedAddress = parseLocation(job.location);
  const isRemote = job.remote === true;

  const jobLocation: Place | undefined =
    !isRemote && parsedAddress
      ? { "@type": "Place", address: parsedAddress }
      : undefined;

  const jobLocationType = isRemote ? ("TELECOMMUTE" as const) : undefined;
  const applicantLocationRequirements: Country | undefined = isRemote
    ? { "@type": "Country", name: "USA" }
    : undefined;

  // validThrough: full ISO datetime. Falls back to (now + VALIDITY_WINDOW_DAYS).
  const validThroughDate =
    job.validThrough ?? new Date(Date.now() + VALIDITY_WINDOW_DAYS * MS_PER_DAY);
  const validThrough = validThroughDate.toISOString();

  const employmentType = mapEmploymentType(job.employmentType);

  // baseSalary: only emit when both bounds are present (Google requires both).
  const baseSalary: MonetaryAmount | undefined =
    job.salaryMin != null && job.salaryMax != null
      ? {
          "@type": "MonetaryAmount",
          currency: job.salaryCurrency ?? "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: job.salaryMin,
            maxValue: job.salaryMax,
            unitText: "YEAR",
          },
        }
      : undefined;

  // directApply: we set true only when we have an apply-flow on our site,
  // which we proxy off applicationQuestions being non-null.
  const directApply: true | undefined =
    job.applicationQuestions !== null && job.applicationQuestions !== undefined
      ? true
      : undefined;

  const identifier: PropertyValue | undefined = job.externalId
    ? {
        "@type": "PropertyValue",
        name: company.provider,
        value: job.externalId,
      }
    : undefined;

  const schema: JobPostingSchema = stripUndefined({
    "@context": "https://schema.org/" as const,
    "@type": "JobPosting" as const,
    title: job.title,
    description,
    datePosted,
    hiringOrganization,
    jobLocation,
    validThrough,
    employmentType,
    baseSalary,
    jobLocationType,
    applicantLocationRequirements,
    directApply,
    identifier,
  });

  return schema;
}
