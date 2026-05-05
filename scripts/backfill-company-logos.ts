/**
 * Consolidated company-logo backfill.
 *
 * Replaces the original two-script setup:
 *   - scripts/backfill-websites.ts  (guess domain from token)
 *   - scripts/enrich-logos.ts       (fetch logo.dev → upload Spaces)
 *
 * Now one script does both, gated by the same resolver the live sync uses.
 * For each company:
 *   1. Read the current Company.website + logoUrl
 *   2. Look up CompanyBoard fields (admin overrides)
 *   3. Run resolveCompanyLogoFull — which checks overrides, then ATS data,
 *      then the multi-TLD heuristic
 *   4. If website changed, update Company.website
 *   5. If website is set and (logoUrl is missing OR --force-logo), re-fetch
 *      from logo.dev and re-upload to Spaces
 *
 * Defaults to dry-run: prints diffs, writes nothing. --apply commits.
 * --force-logo re-fetches even when Company.logoUrl already has a value
 *   (use this to fix bad cached logos after the resolver was improved).
 *
 * Usage:
 *   npx tsx scripts/backfill-company-logos.ts                # dry-run, websites only
 *   npx tsx scripts/backfill-company-logos.ts --apply        # commit website fixes
 *   npx tsx scripts/backfill-company-logos.ts --force-logo --apply
 *                                                            # commit + refetch all logos
 *   npx tsx scripts/backfill-company-logos.ts --slug=astronomer --apply
 *                                                            # single company
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import {
  resolveCompanyLogoSync,
  resolveCompanyLogoFull,
} from "../src/lib/company-logo";
import { enrichCompanyLogo } from "../src/lib/logo-enrichment";

/**
 * Normalize a URL down to a comparable host token: strip protocol, strip
 * leading "www.", lowercase. "https://www.MongoDB.com/" → "mongodb.com".
 * Used so cosmetic differences (www vs apex, trailing slashes, scheme) don't
 * register as "this needs to change."
 */
function normalizeHost(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

interface CliFlags {
  apply: boolean;
  forceLogo: boolean;
  slug: string | null;
  limit: number | null;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, forceLogo: false, slug: null, limit: null };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--force-logo") flags.forceLogo = true;
    else if (arg.startsWith("--slug=")) flags.slug = arg.slice("--slug=".length);
    else if (arg.startsWith("--limit=")) {
      const n = Number.parseInt(arg.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) flags.limit = n;
    }
  }
  return flags;
}

interface ProposedChange {
  companyId: string;
  slug: string;
  provider: "GREENHOUSE" | "ASHBY";
  name: string;
  beforeWebsite: string | null;
  /** The new website value the resolver wants to write (null = leave alone). */
  afterWebsite: string | null;
  /** The website we'll feed to logo.dev — afterWebsite ?? beforeWebsite. */
  effectiveWebsite: string | null;
  websiteSource: string;
  needsLogoRefresh: boolean;
  theme: "light" | "dark" | "auto";
  /**
   * If the override resolver gave us an explicit logoUrl, treat it as a
   * fetch source instead of writing it as-is. The enrichment step will
   * download + Spaces-cache it under logos/manual/{slug}.png.
   */
  overrideLogoSourceUrl: string | null;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);
  if (flags.slug) console.log(`Scope: slug=${flags.slug}`);
  if (flags.forceLogo) console.log("Force-logo: every row with a website re-fetches from logo.dev");
  if (flags.limit) console.log(`Limit: ${flags.limit}`);
  console.log("");

  const companies = await db.company.findMany({
    where: flags.slug ? { slug: flags.slug } : {},
    select: {
      id: true,
      name: true,
      slug: true,
      provider: true,
      website: true,
      logoUrl: true,
    },
    orderBy: { id: "asc" },
    ...(flags.limit ? { take: flags.limit } : {}),
  });

  console.log(`Scanning ${companies.length.toLocaleString()} companies...\n`);

  // Pre-load every CompanyBoard so we can resolve overrides without N+1 queries.
  const boards = await db.companyBoard.findMany({
    select: { provider: true, boardToken: true, website: true, logoUrl: true },
  });
  const boardMap = new Map<string, { website: string | null; logoUrl: string | null }>();
  for (const b of boards) {
    boardMap.set(`${b.provider}:${b.boardToken}`, {
      website: b.website,
      logoUrl: b.logoUrl,
    });
  }

  const proposed: ProposedChange[] = [];
  const sourceTally = new Map<string, number>();

  for (const c of companies) {
    // Translate Company.slug back to a board-token shape for CompanyBoard
    // lookup. Greenhouse: slug === boardToken; Ashby: slug === "ashby-{token}".
    const boardToken =
      c.provider === "GREENHOUSE" ? c.slug : c.slug.replace(/^ashby-/, "");
    const board = boardMap.get(`${c.provider}:${boardToken}`);

    // Two-tier strategy:
    //   - If Company.website is already set, only run the SYNC resolver
    //     (overrides + ATS layer). Don't ask the heuristic to second-guess
    //     an existing value — it produces wrong answers on generic tokens
    //     ("chime", "block", "angi") whose every TLD happens to 200.
    //   - If Company.website is null, run the FULL resolver (heuristic
    //     included) since we have nothing to lose.
    const result = c.website
      ? resolveCompanyLogoSync({
          provider: c.provider,
          slug: c.slug,
          boardOverrideWebsite: board?.website ?? null,
          boardOverrideLogoUrl: board?.logoUrl ?? null,
        })
      : await resolveCompanyLogoFull({
          provider: c.provider,
          slug: c.slug,
          boardOverrideWebsite: board?.website ?? null,
          boardOverrideLogoUrl: board?.logoUrl ?? null,
        });

    sourceTally.set(result.websiteSource, (sourceTally.get(result.websiteSource) ?? 0) + 1);

    // The website we'll actually use for this company. If the resolver
    // produced a better answer (override, ATS, heuristic), use that.
    // Otherwise keep whatever Company.website already had — important for
    // --force-logo passes that need to refresh every cached PNG against the
    // existing (presumably-correct) website.
    const effectiveWebsite = result.website ?? c.website;

    // Compare on the normalized host so "https://www.mongodb.com" and
    // "https://mongodb.com" don't register as a change worth applying.
    const beforeHost = normalizeHost(c.website);
    const afterHost = normalizeHost(result.website);
    const websiteChanged =
      result.website !== null && beforeHost !== afterHost;

    const needsLogoRefresh =
      websiteChanged ||
      flags.forceLogo ||
      (effectiveWebsite !== null && c.logoUrl === null);

    // If the override resolver supplied an explicit logoUrl (override map
    // or CompanyBoard.logoUrl), thread it through as a fetch source so
    // enrichment caches it to Spaces.
    const overrideLogoSourceUrl =
      result.logoUrl !== null &&
      (result.logoSource === "override" || result.logoSource === "board")
        ? result.logoUrl
        : null;

    // Force a refresh whenever an override logo source is present — the
    // bytes might have changed even if the URL didn't.
    const finalNeedsRefresh = needsLogoRefresh || overrideLogoSourceUrl !== null;

    if (websiteChanged || finalNeedsRefresh) {
      proposed.push({
        companyId: c.id,
        slug: c.slug,
        provider: c.provider,
        name: c.name,
        beforeWebsite: c.website,
        afterWebsite: result.website,
        effectiveWebsite,
        websiteSource: result.websiteSource,
        needsLogoRefresh: finalNeedsRefresh,
        theme: result.theme,
        overrideLogoSourceUrl,
      });
    }
  }

  console.log("Website source distribution:");
  for (const [src, count] of [...sourceTally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(12)} ${String(count).padStart(6)}`);
  }
  console.log("");
  console.log(`Companies needing changes: ${proposed.length.toLocaleString()}`);

  // Print up to 30 sample diffs grouped by source so the operator can sanity-check.
  const websiteChanges = proposed.filter((p) => p.afterWebsite !== p.beforeWebsite);
  if (websiteChanges.length > 0) {
    console.log(`\nSample of ${Math.min(30, websiteChanges.length)} website changes:`);
    for (const p of websiteChanges.slice(0, 30)) {
      console.log(
        `  [${p.websiteSource}] ${p.name} (${p.slug})\n    ${p.beforeWebsite ?? "(null)"}\n    → ${p.afterWebsite ?? "(null)"}`,
      );
    }
  }

  if (!flags.apply) {
    console.log("\nDry-run only — re-run with --apply to commit.");
    await db.$disconnect();
    return;
  }

  if (proposed.length === 0) {
    console.log("\nNothing to apply.");
    await db.$disconnect();
    return;
  }

  console.log("\nApplying...");
  let websitesUpdated = 0;
  let logosEnriched = 0;
  let logosFailed = 0;

  for (const p of proposed) {
    if (p.afterWebsite !== p.beforeWebsite && p.afterWebsite !== null) {
      await db.company.update({
        where: { id: p.companyId },
        data: { website: p.afterWebsite },
      });
      websitesUpdated++;
    }

    if (p.needsLogoRefresh) {
      // Clear the old logo so enrichment writes a fresh URL. Spaces stores
      // by either hostname or slug so the new key may differ from the old
      // one — orphaned old objects are acceptable (separate Spaces prune
      // pass can clean them up later).
      if (flags.forceLogo || p.overrideLogoSourceUrl) {
        await db.company.update({
          where: { id: p.companyId },
          data: { logoUrl: null },
        });
      }

      // Override-supplied source URL → fetch + cache it directly.
      // Otherwise → fall through to the website + theme path.
      let cdnUrl: string | null = null;
      if (p.overrideLogoSourceUrl) {
        cdnUrl = await enrichCompanyLogo(
          { id: p.companyId, name: p.name, website: p.effectiveWebsite, slug: p.slug },
          { sourceUrl: p.overrideLogoSourceUrl },
        );
      } else if (p.effectiveWebsite) {
        cdnUrl = await enrichCompanyLogo(
          { id: p.companyId, name: p.name, website: p.effectiveWebsite },
          { theme: p.theme },
        );
      }

      if (cdnUrl) logosEnriched++;
      else logosFailed++;
    }

    if ((websitesUpdated + logosEnriched + logosFailed) % 50 === 0) {
      console.log(`  progress: ${websitesUpdated} websites, ${logosEnriched} logos enriched, ${logosFailed} logo failures`);
    }
  }

  console.log(`\nDone: ${websitesUpdated} websites updated, ${logosEnriched} logos enriched, ${logosFailed} logo failures`);
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
