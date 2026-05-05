/**
 * Canonical website + logo resolver.
 *
 * Resolution order:
 *   1. CompanyBoard.website / CompanyBoard.logoUrl   ← admin per-row UI
 *   2. Override map (src/lib/company-logo/overrides) ← code-level truth
 *   3. ATS-supplied board metadata                   ← Greenhouse only
 *   4. Heuristic multi-TLD probe (async, optional)   ← last resort
 *
 * The resolver does NOT do the logo.dev fetch + Spaces upload — that's the
 * downstream `enrichCompanyLogo()` step. This function's job is purely to
 * decide what website + logo *inputs* belong on the Company row.
 *
 * Pure synchronous variant `resolveCompanyLogoSync()` covers steps 1-3,
 * which is what sync.ts needs (sync hot path can't make a 5×HTTP probe).
 * The async variant `resolveCompanyLogoFull()` adds step 4 and is used by
 * the backfill script.
 */

import type { AtsProvider } from "@prisma/client";
import { lookupLogoOverride } from "./overrides";
import { guessWebsiteFromSlug } from "./heuristic";

export interface ResolveLogoInput {
  provider: AtsProvider;
  slug: string;
  /** From CompanyBoard.website if admin-curated, else null. */
  boardOverrideWebsite?: string | null;
  /** From CompanyBoard.logoUrl if admin-curated, else null. */
  boardOverrideLogoUrl?: string | null;
  /** From Greenhouse `board.website` (ATS metadata). */
  atsWebsite?: string | null;
  /** From Greenhouse `board.logo` (ATS metadata). */
  atsLogoUrl?: string | null;
}

export interface ResolveLogoResult {
  website: string | null;
  logoUrl: string | null;
  /** Where the website value came from. Useful for backfill diff output. */
  websiteSource: "board" | "override" | "ats" | "heuristic" | "none";
  /** Where the logoUrl value came from. */
  logoSource: "board" | "override" | "ats" | "none";
}

/**
 * Resolver for the sync hot path. Covers steps 1-3 (no multi-TLD HTTP probe).
 *
 * Returns websiteSource: "none" if none of the layers produced a value —
 * the caller (sync) leaves Company.website unchanged in that case, and the
 * heuristic + enrichment fire later from the backfill script.
 *
 * Note: this function is async because the override lookup hits the DB
 * (B.4 of HARDENING_PLAN.md). The "Sync" suffix in the name now refers to
 * "no expensive multi-TLD HTTP probe, safe for the sync hot path", NOT
 * to JavaScript synchronous semantics.
 */
export async function resolveCompanyLogoSync(
  input: ResolveLogoInput,
): Promise<ResolveLogoResult> {
  const { provider, slug, boardOverrideWebsite, boardOverrideLogoUrl, atsWebsite, atsLogoUrl } = input;

  const override = await lookupLogoOverride(provider, slug);

  // Website resolution
  let website: string | null = null;
  let websiteSource: ResolveLogoResult["websiteSource"] = "none";
  if (boardOverrideWebsite && boardOverrideWebsite.trim()) {
    website = boardOverrideWebsite.trim();
    websiteSource = "board";
  } else if (override?.website) {
    website = override.website;
    websiteSource = "override";
  } else if (atsWebsite && atsWebsite.trim()) {
    website = atsWebsite.trim();
    websiteSource = "ats";
  }

  // Logo resolution
  let logoUrl: string | null = null;
  let logoSource: ResolveLogoResult["logoSource"] = "none";
  if (boardOverrideLogoUrl && boardOverrideLogoUrl.trim()) {
    logoUrl = boardOverrideLogoUrl.trim();
    logoSource = "board";
  } else if (override?.logoUrl) {
    logoUrl = override.logoUrl;
    logoSource = "override";
  } else if (atsLogoUrl && atsLogoUrl.trim()) {
    logoUrl = atsLogoUrl.trim();
    logoSource = "ats";
  }

  return { website, logoUrl, websiteSource, logoSource };
}

/**
 * Async resolver for the backfill script. Falls through to the multi-TLD
 * heuristic when steps 1-3 don't produce a website.
 */
export async function resolveCompanyLogoFull(
  input: ResolveLogoInput,
): Promise<ResolveLogoResult> {
  const sync = await resolveCompanyLogoSync(input);
  if (sync.websiteSource !== "none") return sync;

  const guessed = await guessWebsiteFromSlug(input.slug);
  if (guessed) {
    return { ...sync, website: guessed, websiteSource: "heuristic" };
  }
  return sync;
}
