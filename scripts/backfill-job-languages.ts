/**
 * One-shot backfill: populate `Job.requiredLanguages` for every existing
 * row by running the regex extractor over its `content`. Idempotent —
 * skips rows that already have at least one entry, so re-runs are safe.
 *
 * Run via:
 *   npx tsx scripts/backfill-job-languages.ts            # process all rows
 *   npx tsx scripts/backfill-job-languages.ts --apply    # alias of the default
 *   npx tsx scripts/backfill-job-languages.ts --dry-run  # log changes without writing
 *
 * Designed for ~100k row tables. Streams in BATCH_SIZE pages via cursor
 * pagination so memory use stays flat regardless of table size.
 */

import "dotenv/config";

import { db } from "../src/lib/db";
import { extractRequiredLanguages } from "../src/lib/jobs/language-extractor";

const BATCH_SIZE = 500;

interface CliFlags {
  apply: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  // Default to apply mode — this is a write-only backfill and explicit
  // dry-run is the safer dissent. Mirrors backfill-job-eligibility.ts's
  // posture which inverts the default for a destructive classifier.
  let apply = true;
  for (const arg of argv) {
    if (arg === "--dry-run") apply = false;
    if (arg === "--apply") apply = true;
  }
  return { apply };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const mode = flags.apply ? "APPLY" : "dry-run";

  const total = await db.job.count();
  console.log(
    `[backfill] mode=${mode} batchSize=${BATCH_SIZE} totalJobs=${total.toLocaleString()}`,
  );

  let cursor: string | undefined;
  let processed = 0;
  let withRequirements = 0;
  let skipped = 0;
  let updated = 0;

  // Cursor pagination — stable across writes because we only ever filter
  // forward by id and never re-process the same row. orderBy id ASC keeps
  // the order deterministic so cursor-based paging is correct.
  for (;;) {
    const batch = await db.job.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        content: true,
        requiredLanguages: true,
      },
    });
    if (batch.length === 0) break;

    for (const job of batch) {
      processed += 1;

      // Idempotency: any prior write wins. The caller can re-run safely
      // after a partial failure; rows that already have entries stay put.
      if (job.requiredLanguages.length > 0) {
        skipped += 1;
        continue;
      }

      const languages = extractRequiredLanguages(job.content ?? "");
      if (languages.length === 0) continue;

      withRequirements += 1;
      if (flags.apply) {
        await db.job.update({
          where: { id: job.id },
          data: { requiredLanguages: languages },
        });
        updated += 1;
      } else {
        console.log(`[backfill] would update ${job.id}: ${languages.join(",")}`);
      }
    }

    console.log(
      `[backfill] processed ${processed}/${total}, ${withRequirements} with requirements (updated=${updated} skipped=${skipped})`,
    );

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  console.log(
    `[backfill] done. processed=${processed} updated=${updated} skipped=${skipped} withRequirements=${withRequirements}`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill] fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
