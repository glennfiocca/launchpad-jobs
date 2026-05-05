/**
 * Detect Ashby self-hosters (companies whose hosted-board page is dead
 * because they redirect users to their own careers site) and rewrite each
 * affected Job's `absoluteUrl` to the canonical custom-domain URL.
 *
 * Algorithm per Ashby company:
 *   1. Query Ashby GraphQL for `customJobsPageUrl`. If null, skip — the
 *      hosted board works fine and the existing absoluteUrls are correct.
 *   2. Scrape the careers index for /careers/{slug} links.
 *   3. For each slug, fetch the page and grab the embedded Ashby UUID.
 *   4. Map UUID → custom URL. Update each matching Job.absoluteUrl.
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

    if (map.byUuid.size === 0) {
      console.log(`  [self-host] ${company.name} (${boardName}) — customJobsPageUrl=${map.org.customJobsPageUrl} but 0 slug→uuid matches`);
      continue;
    }

    // Pull the candidate jobs and figure out which ones we can rewrite.
    const jobs = await db.job.findMany({
      where: { companyId: company.id, isActive: true },
      select: { id: true, externalId: true, absoluteUrl: true, title: true },
    });

    const updates: Array<{ id: string; before: string | null; after: string; title: string }> = [];
    let unmatched = 0;
    for (const j of jobs) {
      const newUrl = map.byUuid.get(j.externalId);
      if (!newUrl) {
        unmatched++;
        continue;
      }
      if (j.absoluteUrl === newUrl) continue; // already correct
      updates.push({ id: j.id, before: j.absoluteUrl, after: newUrl, title: j.title });
    }

    console.log(
      `  [self-host] ${company.name} (${boardName}) — ${map.org.customJobsPageUrl}\n` +
      `              slugs=${map.byUuid.size} jobs=${jobs.length} updates=${updates.length} unmatched=${unmatched}`,
    );

    if (updates.length === 0) continue;
    totalRewrites += updates.length;

    // Show a small sample for sanity-check
    for (const u of updates.slice(0, 3)) {
      console.log(`              ${u.title.slice(0, 50)}`);
      console.log(`                ${u.before ?? "(null)"}`);
      console.log(`                → ${u.after}`);
    }

    if (flags.apply && updates.length > 0) {
      await db.$transaction(
        async (tx) => {
          for (const u of updates) {
            await tx.job.update({
              where: { id: u.id },
              data: { absoluteUrl: u.after },
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
