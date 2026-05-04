import type { Metadata } from "next";
import type { JobWithCompany } from "@/lib/jobs/get-job";

const APP_URL = "https://trypipeline.ai";
const SITE_NAME = "Pipeline";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

// Strip HTML tags and collapse whitespace. Best-effort — we don't need a full
// HTML parser here, just enough to get readable text out of the Greenhouse
// content blob for meta description purposes.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  // Trim to max, then back up to the previous space to avoid mid-word cuts.
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
}

// Pull out a "City, ST" substring from a free-form location for the title.
// Falls back to the raw value if it's already short.
function shortLocation(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^remote$/i.test(trimmed)) return "Remote";
  // Take up to two comma-separated tokens for compactness.
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
): string | null {
  if (min == null || max == null) return null;
  const cur = currency ?? "USD";
  const fmt = (n: number) => `${Math.round(n / 1000)}K`;
  return `${cur} ${fmt(min)}–${fmt(max)}`;
}

/**
 * Build Next.js Metadata for a job detail page. Drives <title>, description,
 * canonical, OpenGraph, and Twitter card. Pure function.
 */
export function buildJobMetadata(job: JobWithCompany): Metadata {
  const { company } = job;
  const loc = shortLocation(job.location);

  // Title: "{title} at {company} — {loc} | Pipeline", truncated to TITLE_MAX.
  const titleCore = `${job.title} at ${company.name}${loc ? ` — ${loc}` : ""}`;
  const titleFull = `${titleCore} | ${SITE_NAME}`;
  const title = truncate(titleFull, TITLE_MAX);

  // Description: plain-text first ~155 chars of content, with optional salary.
  const plain = job.content ? stripHtml(job.content) : "";
  const salary = formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency);

  let description: string;
  if (plain.length > 0) {
    const base = truncate(plain, DESCRIPTION_MAX);
    description = salary ? `${base} (${salary})` : base;
  } else {
    description = `Apply to ${job.title} at ${company.name} on ${SITE_NAME}.`;
  }

  const canonical = `${APP_URL}/jobs/${job.publicJobId}`;
  // OG image route is built in P6 — referenced ahead of time so once it
  // lands the URL resolves without a metadata change.
  const ogImage = `/jobs/${job.publicJobId}/opengraph-image`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: SITE_NAME,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
