/**
 * Detect Ashby self-hosters (companies whose hosted-board page is dead
 * because they redirect users to their own careers site) and rewrite each
 * affected Job's `absoluteUrl` AND `applyUrl` to the canonical custom-domain
 * URL. Both fields move in lockstep — the apply form lives on the listing
 * page for self-hosters, so the same URL serves "view listing" and "submit
 * application".
 *
 * Algorithm per Ashby company:
 *   1. Query Ashby GraphQL for `customJobsPageUrl`. If null, skip — the
 *      hosted board works fine and the existing absoluteUrls are correct.
 *   2. Scrape the careers index for /careers/{slug} links.
 *   3. For each slug, fetch the page and grab the embedded Ashby UUID.
 *   4. Map UUID → custom URL. Update each matching Job's absoluteUrl + applyUrl.
 *
 * Idempotent: re-running just no-ops on jobs already pointed at the right
 * URL.
 *
 * Usage:
 *   npx tsx scripts/backfill-ashby-custom-urls.ts            # dry-run
 *   npx tsx scripts/backfill-ashby-custom-urls.ts --apply    # commit
 *   npx tsx scripts/backfill-ashby-custom-urls.ts --board=cursor --apply
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { discoverAshbyCustomJobMap } from "../src/lib/ashby-custom-jobs";

interface CliFlags {
  apply: boolean;
  board: string | null;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, board: null };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg.startsWith("--board=")) flags.board = arg.slice("--board=".length);
  }
  return flags;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);
  if (flags.board) console.log(`Scope: board=${flags.board}\n`);
  else console.log("");

  // All Ashby companies. Each Company.slug is "ashby-{boardName}"; the
  // CompanyBoard is the canonical source for the boardName itself.
  const where = flags.board
    ? { provider: "ASHBY" as const, slug: `ashby-${flags.board}` }
    : { provider: "ASHBY" as const };

  const companies = await db.company.findMany({
    where,
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  console.log(`Scanning ${companies.length} Ashby companies...\n`);

  let selfHosters = 0;
  let totalRewrites = 0;

  for (const company of companies) {
    const boardName = company.slug.replace(/^ashby-/, "");

    const map = await discoverAshbyCustomJobMap(boardName);
    if (!map) continue; // not self-hosted, hosted board works
    selfHosters++;

    // Pull the candidate jobs and figure out which ones we can rewrite.
    // Even when byUuid is empty (no scrape-able slugs), we may still be
    // able to rewrite via the ?ashby_jid={uuid} fallback.
    const jobs = await db.job.findMany({
      where: { companyId: company.id, isActive: true },
      select: { id: true, externalId: true, absoluteUrl: true, applyUrl: true, title: true },
    });

    interface UrlUpdate {
      id: string;
      before: string | null;
      beforeApply: string | null;
      after: string;
      title: string;
      via: "slug" | "ashby_jid";
    }
    const updates: UrlUpdate[] = [];
    let usedSlug = 0;
    let usedFallback = 0;
    let stillBroken = 0;
    for (const j of jobs) {
      // Resolve the canonical URL for this job (slug first, fallback second).
      // Both absoluteUrl and applyUrl get rewritten to the same value — the
      // apply form lives on the listing page for self-hosters.
      const slugUrl = map.byUuid.get(j.externalId);
      if (slugUrl) {
        if (j.absoluteUrl !== slugUrl || j.applyUrl !== slugUrl) {
          updates.push({
            id: j.id,
            before: j.absoluteUrl,
            beforeApply: j.applyUrl,
            after: slugUrl,
            title: j.title,
            via: "slug",
          });
        }
        usedSlug++;
        continue;
      }
      const fallback = map.buildFallbackUrl(j.externalId);
      if (fallback) {
        if (j.absoluteUrl !== fallback || j.applyUrl !== fallback) {
          updates.push({
            id: j.id,
            before: j.absoluteUrl,
            beforeApply: j.applyUrl,
            after: fallback,
            title: j.title,
            via: "ashby_jid",
          });
        }
        usedFallback++;
        continue;
      }
      stillBroken++;
    }

    console.log(
      `  [self-host] ${company.name} (${boardName}) — ${map.org.customJobsPageUrl}\n` +
      `              slugs=${usedSlug} ashby_jid_fallback=${usedFallback} stillBroken=${stillBroken} updates=${updates.length}`,
    );

    if (updates.length === 0) continue;
    totalRewrites += updates.length;

    // Show a small sample for sanity-check
    for (const u of updates.slice(0, 3)) {
      console.log(`              [${u.via}] ${u.title.slice(0, 50)}`);
      console.log(`                absolute: ${u.before ?? "(null)"}`);
      console.log(`                apply:    ${u.beforeApply ?? "(null)"}`);
      console.log(`                → ${u.after}`);
    }

    if (flags.apply && updates.length > 0) {
      await db.$transaction(
        async (tx) => {
          for (const u of updates) {
            await tx.job.update({
              where: { id: u.id },
              data: { absoluteUrl: u.after, applyUrl: u.after },
            });
          }
        },
        { timeout: 30_000 },
      );
    }
  }

  console.log(`\nSelf-hosters detected: ${selfHosters}`);
  console.log(`Jobs rewritten: ${totalRewrites}`);
  if (!flags.apply && totalRewrites > 0) {
    console.log("\nDry-run only — re-run with --apply to commit.");
  }

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
