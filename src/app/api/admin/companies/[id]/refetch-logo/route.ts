import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession, notFound } from "../../../_helpers";
import { resolveCompanyLogoSync } from "@/lib/company-logo";
import { enrichCompanyLogo } from "@/lib/logo-enrichment";
import type { ApiResponse } from "@/types";

/**
 * Force-refresh a single company's logo.
 *
 * Bypasses the sync cycle for the case where an admin has already corrected
 * `CompanyBoard.website` (or curated an override) and wants the matching
 * `Company` row's logo refreshed *now* without waiting for the next scheduled
 * sync to flow the change through.
 *
 * Behavior:
 *   1. Look up the CompanyBoard for the provided ID
 *   2. Find the matching Company row by (provider, slug). slug ===
 *      boardToken for Greenhouse, "ashby-{token}" for Ashby — same
 *      derivation that sync.ts uses.
 *   3. Resolve the canonical website using CompanyBoard fields + override map
 *   4. Update Company.website if it changed
 *   5. Clear Company.logoUrl and re-run logo enrichment with the new website
 *
 * Returns the updated Company row so the admin UI can refresh its display.
 */

const ASHBY_PREFIX = "ashby-";

function deriveSlug(provider: "GREENHOUSE" | "ASHBY", boardToken: string): string {
  return provider === "GREENHOUSE" ? boardToken : `${ASHBY_PREFIX}${boardToken}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;

  const board = await db.companyBoard.findUnique({ where: { id } });
  if (!board) return notFound("Company board not found");

  const slug = deriveSlug(board.provider, board.boardToken);
  const company = await db.company.findUnique({
    where: { provider_slug: { provider: board.provider, slug } },
  });
  if (!company) {
    return notFound(
      `No Company row exists for provider=${board.provider} slug=${slug} — run sync first`,
    );
  }

  const resolved = await resolveCompanyLogoSync({
    provider: board.provider,
    slug,
    boardOverrideWebsite: board.website,
    boardOverrideLogoUrl: board.logoUrl,
    // No ATS metadata at this entry point; sync will fold that in next time.
  });

  // 1. Update website if the resolver produced a better answer.
  if (resolved.website && resolved.website !== company.website) {
    await db.company.update({
      where: { id: company.id },
      data: { website: resolved.website },
    });
  }

  // 2. Clear stale logoUrl + logoSource, then re-enrich. Track B.5 of
  // HARDENING_PLAN.md: enrichment writes both fields atomically.
  // If the resolver gave us an explicit logoUrl from an override, treat it
  // as a fetch source — enrichment downloads it and caches to Spaces under
  // logos/manual/{slug}.png. Otherwise derive from website + theme.
  await db.company.update({
    where: { id: company.id },
    data: { logoUrl: null, logoSource: null },
  });

  if (resolved.logoUrl) {
    await enrichCompanyLogo(
      {
        id: company.id,
        name: company.name,
        website: resolved.website ?? company.website,
        slug: company.slug,
      },
      { sourceUrl: resolved.logoUrl },
    );
  } else {
    await enrichCompanyLogo({
      id: company.id,
      name: company.name,
      website: resolved.website ?? company.website,
    });
  }

  const updated = await db.company.findUnique({
    where: { id: company.id },
    select: { id: true, name: true, slug: true, website: true, logoUrl: true, logoSource: true },
  });

  return NextResponse.json<ApiResponse<typeof updated>>({
    success: true,
    data: updated,
  });
}
