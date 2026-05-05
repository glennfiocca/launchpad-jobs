/**
 * Re-classifies every Job row using the location classifier and writes the
 * resulting `countryCode`, `locationCategory`, and `isUSEligible` fields.
 *
 * Default mode is dry-run — prints per-category counts and a sample of
 * proposed changes. Pass --apply to commit.
 *
 * The classifier we run against existing rows uses only `Job.location` and
 * `Job.remote` because the structured Ashby data is fetched at sync time and
 * not stored. That's fine: most Ashby jobs have "City, State" in `location`
 * which the heuristic handles. Subsequent syncs will refine each row using
 * the full Ashby signal.
 *
 * Usage:
 *   npx tsx scripts/backfill-job-eligibility.ts            # dry-run
 *   npx tsx scripts/backfill-job-eligibility.ts --apply    # commit
 *   npx tsx scripts/backfill-job-eligibility.ts --sample=200   # show N proposed changes
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { classifyLocation } from "../src/lib/location-classifier";

interface CliFlags {
  apply: boolean;
  sample: number;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, sample: 50 };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg.startsWith("--sample=")) {
      const n = Number.parseInt(arg.slice("--sample=".length), 10);
      if (Number.isFinite(n) && n >= 0) flags.sample = n;
    }
  }
  return flags;
}

interface Update {
  id: string;
  before: { countryCode: string | null; locationCategory: string | null; isUSEligible: boolean };
  after: { countryCode: string | null; locationCategory: string; isUSEligible: boolean };
  location: string | null;
  remote: boolean;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);

  const total = await db.job.count();
  console.log(`Scanning ${total.toLocaleString()} jobs...\n`);

  const PAGE = 2000;
  const updates: Update[] = [];
  const categoryCounts = new Map<string, number>();
  const eligibleCount = { yes: 0, no: 0 };

  for (let skip = 0; skip < total; skip += PAGE) {
    const batch = await db.job.findMany({
      skip,
      take: PAGE,
      select: {
        id: true,
        location: true,
        remote: true,
        countryCode: true,
        locationCategory: true,
        isUSEligible: true,
      },
      orderBy: { id: "asc" },
    });

    for (const j of batch) {
      const result = classifyLocation({ location: j.location, remote: j.remote });

      categoryCounts.set(result.category, (categoryCounts.get(result.category) ?? 0) + 1);
      if (result.isUSEligible) eligibleCount.yes++;
      else eligibleCount.no++;

      const changed =
        result.countryCode !== j.countryCode ||
        result.category !== j.locationCategory ||
        result.isUSEligible !== j.isUSEligible;
      if (changed) {
        updates.push({
          id: j.id,
          before: {
            countryCode: j.countryCode,
            locationCategory: j.locationCategory,
            isUSEligible: j.isUSEligible,
          },
          after: {
            countryCode: result.countryCode,
            locationCategory: result.category,
            isUSEligible: result.isUSEligible,
          },
          location: j.location,
          remote: j.remote,
        });
      }
    }
  }

  console.log("Distribution by category:");
  for (const [cat, count] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${cat.padEnd(15)} ${String(count).padStart(6)}  (${pct}%)`);
  }
  console.log(`\nEligible (would show): ${eligibleCount.yes.toLocaleString()}`);
  console.log(`Hidden (FOREIGN):      ${eligibleCount.no.toLocaleString()}`);
  console.log(`Rows to update:        ${updates.length.toLocaleString()}\n`);

  // Print a sample so the user can eyeball the classifier's output.
  const sample = updates.slice(0, flags.sample);
  if (sample.length > 0) {
    console.log(`Sample of ${sample.length} proposed changes:`);
    for (const u of sample) {
      const loc = (u.location ?? "(null)").slice(0, 50).padEnd(50);
      console.log(
        `  ${loc}  remote=${u.remote ? "Y" : "N"}  → ${u.after.locationCategory.padEnd(15)} ${u.after.countryCode ?? "??"}  eligible=${u.after.isUSEligible}`,
      );
    }
  }

  if (!flags.apply) {
    console.log("\nDry-run only — re-run with --apply to commit.");
    await db.$disconnect();
    return;
  }

  if (updates.length === 0) {
    console.log("\nNothing to apply.");
    await db.$disconnect();
    return;
  }

  console.log(`\nApplying ${updates.length.toLocaleString()} updates...`);

  const BATCH = 50;
  const TX_TIMEOUT_MS = 30_000;
  for (let i = 0; i < updates.length; i += BATCH) {
    const slice = updates.slice(i, i + BATCH);
    await db.$transaction(
      async (tx) => {
        for (const u of slice) {
          await tx.job.update({
            where: { id: u.id },
            data: {
              countryCode: u.after.countryCode,
              locationCategory: u.after.locationCategory,
              isUSEligible: u.after.isUSEligible,
            },
          });
        }
      },
      { timeout: TX_TIMEOUT_MS },
    );
    console.log(`  applied ${Math.min(i + BATCH, updates.length).toLocaleString()} / ${updates.length.toLocaleString()}`);
  }

  console.log("Done.");
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
