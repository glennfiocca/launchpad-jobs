import type { AtsProvider } from "@prisma/client";
import type { NormalizedJob } from "./types";
import { getClient } from "./registry";
import { db } from "../db";
import { generateUniquePublicJobId } from "../public-job-id";
import { createNotification } from "../notifications";
import { enrichCompanyLogo } from "../logo-enrichment";
import { notifyIndexNow } from "../seo/indexnow";
import { resolveCompanyName } from "../company-name";
import { resolveCompanyLogoSync } from "../company-logo";
import { VALIDITY_WINDOW_DAYS } from "@/config/seo";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://trypipeline.ai").replace(/\/$/, "");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Compute a fresh validThrough timestamp. Called on every successful upsert so
// each re-sync extends the JobPosting validity window. When upstream stops
// returning a job, isActive flips false and validThrough is left to lapse —
// that lapse is the signal to Google + downstream consumers.
function nextValidThrough(): Date {
  return new Date(Date.now() + VALIDITY_WINDOW_DAYS * MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  companyName: string;
  boardToken: string;
  provider: AtsProvider;
  jobsAdded: number;
  jobsUpdated: number;
  jobsDeactivated: number;
  applicationsUpdated: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Slug derivation — keeps backward compat for Greenhouse
// ---------------------------------------------------------------------------

function companySlug(provider: AtsProvider, boardToken: string): string {
  if (provider === "GREENHOUSE") return boardToken;
  return `${provider.toLowerCase()}-${boardToken}`;
}

/**
 * "Stickiness" rule for absoluteUrl: if the existing row already points to
 * a per-slug page on the company's own domain (e.g. cursor.com/careers/
 * software-engineer-growth, written by the slug backfill), don't let a
 * subsequent sync downgrade it to the ?ashby_jid fallback or the dead
 * jobs.ashbyhq.com URL.
 *
 * Heuristic: a URL is considered "curated" when its hostname doesn't
 * belong to the ATS provider's hosted-board domain AND it has a path
 * deeper than just "/" or "/careers" (so a fallback like
 * `https://cursor.com/careers?ashby_jid=...` won't trump a true slug URL
 * `https://cursor.com/careers/software-engineer-growth`).
 */
export function shouldPreserveAbsoluteUrl(
  existing: string | null,
  incoming: string | null,
): boolean {
  if (!existing || !incoming) return false;
  if (existing === incoming) return false;
  const e = parseUrl(existing);
  const i = parseUrl(incoming);
  if (!e || !i) return false;

  // If incoming is more specific (different host or longer/specific path),
  // we generally trust it. The only case we want to short-circuit:
  // existing is a slug-style URL on a custom domain, incoming is a query-
  // string fallback on the same domain → keep existing.
  const existingIsSlug =
    !isAtsHostedHost(e.hostname) && pathDepth(e.pathname) >= pathDepth(i.pathname) + 1;
  const incomingIsFallback = i.searchParams.has("ashby_jid");

  return existingIsSlug && incomingIsFallback;
}

function parseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function isAtsHostedHost(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    lower.endsWith("ashbyhq.com") ||
    lower.endsWith("greenhouse.io") ||
    lower.endsWith("greenhouse.com")
  );
}

function pathDepth(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Provider-agnostic board sync
// ---------------------------------------------------------------------------

export async function syncBoard(
  provider: AtsProvider,
  boardToken: string,
  companyName?: string,
  boardOverrideLogoUrl?: string,
  boardOverrideWebsite?: string,
): Promise<SyncResult> {
  const client = getClient(provider, boardToken);

  const result: SyncResult = {
    companyName: companyName ?? boardToken,
    boardToken,
    provider,
    jobsAdded: 0,
    jobsUpdated: 0,
    jobsDeactivated: 0,
    applicationsUpdated: 0,
    errors: [],
  };

  // 1. Board metadata (Greenhouse populates these sometimes; Ashby doesn't)
  let atsWebsite: string | null = null;
  let atsLogoUrl: string | null = null;
  let rawBoardName: string | null = null;
  try {
    const boardMeta = await client.getBoard();
    rawBoardName = boardMeta.name ?? null;
    atsWebsite = boardMeta.website ?? null;
    atsLogoUrl = boardMeta.logoUrl ?? null;
  } catch {
    // Non-fatal — sync continues without metadata
  }

  const slug = companySlug(provider, boardToken);

  // Resolve canonical company name. Caller-supplied `companyName` wins if
  // provided (caller is presumed authoritative); otherwise we run the raw
  // ATS-supplied name through the resolver so curated overrides + smart
  // title-casing fix data quality issues at the write boundary.
  result.companyName = companyName ?? resolveCompanyName({
    provider,
    slug,
    rawName: rawBoardName,
  }).name;

  // Resolve canonical website + logo using the layered resolver.
  // Order: CompanyBoard override → curated map → ATS-supplied → null.
  // The async multi-TLD heuristic only runs in the offline backfill script.
  const logo = resolveCompanyLogoSync({
    provider,
    slug,
    boardOverrideWebsite: boardOverrideWebsite ?? null,
    boardOverrideLogoUrl: boardOverrideLogoUrl ?? null,
    atsWebsite,
    atsLogoUrl,
  });

  // Resolved logoUrl semantics:
  //   - Manual override (override map / CompanyBoard.logoUrl): treat as a
  //     SOURCE URL — fetch + cache to Spaces. We do NOT write the source
  //     URL into Company.logoUrl; the enrichment step does that with the
  //     final Spaces CDN URL.
  //   - ATS-supplied (Greenhouse board.logo): write directly to Company.
  //     Greenhouse hosts these on its own CDN; no need to re-cache.
  const isManualOverrideLogo =
    logo.logoUrl !== null &&
    (logo.logoSource === "override" || logo.logoSource === "board");
  const writeAtsLogo =
    logo.logoUrl !== null && logo.logoSource === "ats";

  // 2. Upsert company.
  // Only update `website`/`logoUrl` when the resolver produced one. Manual
  // overrides take the enrichment path (below) so we don't leak the source
  // URL into Company.logoUrl mid-cache.
  const company = await db.company.upsert({
    where: { provider_slug: { provider, slug } },
    update: {
      name: result.companyName,
      provider,
      ...(logo.website && { website: logo.website }),
      ...(writeAtsLogo && { logoUrl: logo.logoUrl }),
    },
    create: {
      name: result.companyName,
      slug,
      provider,
      website: logo.website,
      logoUrl: writeAtsLogo ? logo.logoUrl ?? undefined : undefined,
    },
  });

  // Enrich logo in background:
  //   - Manual override → fetch the source URL, cache to Spaces under
  //     logos/manual/{slug}.png, write the CDN URL.
  //   - No logo at all → derive from website + theme via logo.dev.
  if (isManualOverrideLogo && logo.logoUrl) {
    enrichCompanyLogo(
      { id: company.id, website: company.website, name: company.name, slug: company.slug },
      { sourceUrl: logo.logoUrl },
    )
      .then((url) => {
        if (!url) {
          console.warn(`[logo-enrichment] Failed to cache override logo for: ${company.name}`);
        }
      })
      .catch(() => undefined);
  } else if (!company.logoUrl) {
    enrichCompanyLogo({
      id: company.id,
      website: company.website,
      name: company.name,
    })
      .then((url) => {
        if (!url) {
          console.warn(`[logo-enrichment] No logo found for company: ${company.name}`);
        }
      })
      .catch(() => undefined);
  }

  // 3. Fetch normalized jobs
  let jobs: readonly NormalizedJob[];
  try {
    jobs = await client.getJobs();
  } catch (err) {
    result.errors.push(
      `Failed to fetch jobs: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  // 4. Upsert each job
  const activeExternalIds = new Set<string>();
  // Collect publicJobIds for IndexNow notification at end of run.
  const newPublicJobIds: string[] = [];

  for (const normalizedJob of jobs) {
    activeExternalIds.add(normalizedJob.externalId);

    const jobData = {
      title: normalizedJob.title,
      location: normalizedJob.location,
      department: normalizedJob.department,
      employmentType: normalizedJob.employmentType,
      remote: normalizedJob.remote ?? false,
      boardToken,
      provider,
      absoluteUrl: normalizedJob.absoluteUrl,
      content: normalizedJob.content,
      isActive: true,
      postedAt: normalizedJob.postedAt,
      countryCode: normalizedJob.countryCode,
      locationCategory: normalizedJob.locationCategory,
      isUSEligible: normalizedJob.isUSEligible,
      ...(normalizedJob.compensation?.min != null && { salaryMin: normalizedJob.compensation.min }),
      ...(normalizedJob.compensation?.max != null && { salaryMax: normalizedJob.compensation.max }),
      ...(normalizedJob.compensation?.currency && { salaryCurrency: normalizedJob.compensation.currency }),
    };

    try {
      const existing = await db.job.findUnique({
        where: {
          provider_externalId_boardToken: {
            provider,
            externalId: normalizedJob.externalId,
            boardToken,
          },
        },
      });

      if (existing) {
        // Preserve original postedAt — don't overwrite with ATS updated_at
        const { postedAt: _ignored, ...updateData } = jobData;

        // Don't downgrade a curated custom-domain absoluteUrl back to a
        // generic URL. The Ashby client rewrites absoluteUrl to the
        // ?ashby_jid={uuid} fallback for self-hosters, but per-slug
        // backfills can write even cleaner URLs (e.g. cursor.com/careers/
        // software-engineer-growth) — those should survive subsequent
        // syncs unchanged.
        if (
          shouldPreserveAbsoluteUrl(existing.absoluteUrl, updateData.absoluteUrl)
        ) {
          updateData.absoluteUrl = existing.absoluteUrl;
        }

        await db.job.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            validThrough: nextValidThrough(),
            ...(!existing.publicJobId
              ? { publicJobId: await generateUniquePublicJobId() }
              : {}),
          },
        });
        result.jobsUpdated++;
      } else {
        const publicJobId = await generateUniquePublicJobId();
        await db.job.create({
          data: {
            ...jobData,
            externalId: normalizedJob.externalId,
            companyId: company.id,
            publicJobId,
            validThrough: nextValidThrough(),
          },
        });
        newPublicJobIds.push(publicJobId);
        result.jobsAdded++;
      }
    } catch (err) {
      result.errors.push(
        `Job ${normalizedJob.externalId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 5. Deactivate jobs no longer in listing
  // Snapshot the rows we're about to deactivate so we can both notify
  // IndexNow about the expirations and downstream-update affected applications.
  const expiringJobs = await db.job.findMany({
    where: {
      boardToken,
      provider,
      isActive: true,
      externalId: { notIn: Array.from(activeExternalIds) },
    },
    select: { id: true, publicJobId: true },
  });

  const deactivated = await db.job.updateMany({
    where: {
      boardToken,
      provider,
      isActive: true,
      externalId: { notIn: Array.from(activeExternalIds) },
    },
    data: { isActive: false },
  });
  result.jobsDeactivated = deactivated.count;

  const expiredPublicJobIds = expiringJobs
    .map((j) => j.publicJobId)
    .filter((id): id is string => Boolean(id));

  // 6. Mark active applications on removed listings as LISTING_REMOVED
  if (deactivated.count > 0) {
    const removedJobIds = expiringJobs.map((j) => j.id);

    const affectedApplications = await db.application.findMany({
      where: {
        jobId: { in: removedJobIds },
        status: { notIn: ["REJECTED", "WITHDRAWN", "LISTING_REMOVED", "OFFER"] },
      },
      include: { job: { include: { company: true } } },
    });

    for (const app of affectedApplications) {
      try {
        await db.application.update({
          where: { id: app.id },
          data: { status: "LISTING_REMOVED" },
        });

        await db.applicationStatusHistory.create({
          data: {
            applicationId: app.id,
            fromStatus: app.status,
            toStatus: "LISTING_REMOVED",
            reason: "Job listing removed by employer",
            triggeredBy: "system",
          },
        });

        // Notify applicant (fire-and-forget)
        createNotification({
          userId: app.userId,
          type: "LISTING_REMOVED",
          title: `Listing removed: ${app.job.title} at ${app.job.company.name}`,
          body: "The employer has removed this job listing. Your application history is preserved.",
          ctaUrl: `/dashboard?app=${app.id}`,
          ctaLabel: "View Dashboard",
          applicationId: app.id,
          jobId: app.jobId,
          data: {
            type: "LISTING_REMOVED",
            applicationId: app.id,
            jobId: app.jobId,
            jobTitle: app.job.title,
            companyName: app.job.company.name,
          },
          dedupeKey: `LISTING_REMOVED:${app.id}`,
        }).catch(() => undefined);

        result.applicationsUpdated++;
      } catch (err) {
        result.errors.push(
          `Application ${app.id} LISTING_REMOVED update: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // 7. Notify IndexNow of new + expired URLs (fire-and-forget).
  // Bing/Yandex/Naver/Seznam pick this up within minutes; Google ignores
  // IndexNow and uses the sitemap. notifyIndexNow swallows all errors and
  // no-ops when INDEXNOW_KEY is unset, so this never fails the sync.
  const changedUrls = [
    ...newPublicJobIds.map((id) => `${APP_URL}/jobs/${id}`),
    ...expiredPublicJobIds.map((id) => `${APP_URL}/jobs/${id}`),
  ];
  if (changedUrls.length > 0) {
    notifyIndexNow(changedUrls).catch(() => undefined);
  }

  return result;
}
