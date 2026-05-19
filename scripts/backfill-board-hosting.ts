/**
 * One-shot backfill: classify hosting + applyHostname on every existing
 * CompanyBoard from the Job rows we've already synced. Avoids waiting
 * for the next sync cycle to populate the new fields.
 *
 * For each active CompanyBoard:
 *   1. Group its Job rows by Job.absoluteUrl hostname.
 *   2. Pick the most common hostname (majority rule — see
 *      src/lib/ats/board-hosting.ts for the rationale).
 *   3. Classify hosting from the hostname:
 *        *.greenhouse.io / *.greenhouse.com -> GREENHOUSE_HOSTED
 *        *.ashbyhq.com                      -> ASHBY_HOSTED
 *        anything else                      -> SELF_HOSTED
 *   4. Update the CompanyBoard row.
 *
 * Boards with zero Job rows (newly seeded, never synced) are left as
 * UNKNOWN — the next sync will classify them.
 *
 * Usage:
 *   npx tsx scripts/backfill-board-hosting.ts          # dry-run
 *   npx tsx scripts/backfill-board-hosting.ts --apply  # commit
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import type { BoardHosting } from "@prisma/client";

interface CliFlags {
  apply: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  return { apply: argv.includes("--apply") };
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function classifyHost(host: string): BoardHosting {
  if (host.endsWith("greenhouse.io") || host.endsWith("greenhouse.com")) {
    return "GREENHOUSE_HOSTED";
  }
  if (host.endsWith("ashbyhq.com")) {
    return "ASHBY_HOSTED";
  }
  return "SELF_HOSTED";
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}\n`);

  const boards = await db.companyBoard.findMany({
    select: { id: true, name: true, boardToken: true, provider: true, hosting: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${boards.length} CompanyBoard rows\n`);

  let classified = 0;
  let skippedNoJobs = 0;
  let unchanged = 0;
  const hostingCounts = new Map<BoardHosting, number>();

  for (const board of boards) {
    const jobs = await db.job.findMany({
      where: { provider: board.provider, boardToken: board.boardToken, isActive: true },
      select: { absoluteUrl: true },
    });

    const counts = new Map<string, number>();
    for (const j of jobs) {
      const h = hostnameOf(j.absoluteUrl);
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }

    if (counts.size === 0) {
      skippedNoJobs++;
      console.log(`  SKIP  ${board.provider} ${board.boardToken} (no job URLs to classify)`);
      continue;
    }

    let topHost = "";
    let topCount = -1;
    for (const [h, c] of counts) {
      if (c > topCount) {
        topHost = h;
        topCount = c;
      }
    }
    const hosting = classifyHost(topHost);
    hostingCounts.set(hosting, (hostingCounts.get(hosting) ?? 0) + 1);

    const willChange = board.hosting !== hosting;
    if (!willChange) {
      unchanged++;
      continue;
    }

    console.log(
      `  ${flags.apply ? "SET " : "WOULD"}  ${board.provider} ${board.boardToken.padEnd(28)} -> ${hosting} (${topHost}, ${topCount}/${jobs.length} jobs)`,
    );
    classified++;

    if (flags.apply) {
      await db.companyBoard.update({
        where: { id: board.id },
        data: { hosting, applyHostname: topHost },
      });
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Boards classified: ${classified}`);
  console.log(`Already correct:   ${unchanged}`);
  console.log(`Skipped (no jobs): ${skippedNoJobs}`);
  console.log(`\nHosting distribution (across boards with jobs):`);
  for (const [h, c] of [...hostingCounts.entries()].sort()) {
    console.log(`  ${h.padEnd(20)} ${c}`);
  }
  if (!flags.apply) {
    console.log("\nDry run only — re-run with --apply to commit.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
