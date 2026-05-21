/**
 * One-shot backfill: populate `Job.requiredLanguages` for every existing
 * row by running the regex extractor over its `content`. Idempotent —
 * skips rows that already have at least one entry, so re-runs are safe.
 *
 * Run via:
 *   npx tsx scripts/backfill-job-languages.ts                   # process all rows
 *   npx tsx scripts/backfill-job-languages.ts --apply           # alias of the default
 *   npx tsx scripts/backfill-job-languages.ts --dry-run         # log changes without writing
 *   npx tsx scripts/backfill-job-languages.ts --from-cursor=<id>  # resume from a known cursor
 *   npx tsx scripts/backfill-job-languages.ts --concurrency=5   # cap parallel updates
 *
 * Designed for ~100k row tables. Streams in BATCH_SIZE pages via cursor
 * pagination so memory use stays flat regardless of table size. Updates
 * inside a batch run with a low concurrency cap to keep the connection
 * pool from saturating. Progress and the most-recent cursor are logged
 * periodically so a crashed run can resume with --from-cursor.
 */

import "dotenv/config";

import { db } from "../src/lib/db";
import { extractRequiredLanguages } from "../src/lib/jobs/language-extractor";

// Tuning knobs. Conservative defaults — the extractor is fast but the DB
// is the bottleneck on a 100k-row backfill.
const BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 5;
const PROGRESS_LOG_INTERVAL = 1_000;
const CURSOR_LOG_INTERVAL = 5_000;

interface CliFlags {
  apply: boolean;
  fromCursor: string | undefined;
  concurrency: number;
}

function parseFlags(argv: readonly string[]): CliFlags {
  // Default to apply mode — this is a write-only backfill and explicit
  // dry-run is the safer dissent. Mirrors backfill-job-eligibility.ts's
  // posture which inverts the default for a destructive classifier.
  let apply = true;
  let fromCursor: string | undefined;
  let concurrency = DEFAULT_CONCURRENCY;

  for (const arg of argv) {
    if (arg === "--dry-run") apply = false;
    else if (arg === "--apply") apply = true;
    else if (arg.startsWith("--from-cursor=")) {
      const value = arg.slice("--from-cursor=".length);
      if (value.length > 0) fromCursor = value;
    } else if (arg.startsWith("--concurrency=")) {
      const value = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (Number.isFinite(value) && value > 0) concurrency = value;
    }
  }

  return { apply, fromCursor, concurrency };
}

/**
 * Run `fn` over each item in `items` with at most `limit` concurrent
 * in-flight promises. Errors are swallowed by callers — this helper
 * only schedules; per-item try/catch lives in the caller.
 */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (limit <= 1) {
    for (const item of items) {
      await fn(item);
    }
    return;
  }

  let index = 0;
  const workers: Array<Promise<void>> = [];
  const next = async (): Promise<void> => {
    while (index < items.length) {
      const i = index;
      index += 1;
      await fn(items[i]);
    }
  };
  for (let w = 0; w < Math.min(limit, items.length); w += 1) {
    workers.push(next());
  }
  await Promise.all(workers);
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const mode = flags.apply ? "APPLY" : "dry-run";

  // Skip-already-done filter — `cardinality(requiredLanguages) = 0` is the
  // idempotent guard. Counted up-front for the % progress denominator and
  // applied as a `where` filter on the page query so we never load rows
  // we'd just skip. Cuts wall time roughly in half on a partially-backfilled
  // table without changing correctness.
  const total = await db.job.count({
    where: { requiredLanguages: { isEmpty: true } },
  });
  console.log(
    `[backfill] mode=${mode} batchSize=${BATCH_SIZE} concurrency=${flags.concurrency} pendingJobs=${total.toLocaleString()}${flags.fromCursor ? ` resumeFrom=${flags.fromCursor}` : ""}`,
  );

  let cursor: string | undefined = flags.fromCursor;
  let processed = 0;
  let withRequirements = 0;
  let updated = 0;
  let errors = 0;
  let lastProgressMilestone = 0;
  let lastCursorMilestone = 0;
  const startTime = Date.now();

  // Cursor pagination — stable across writes because we only ever filter
  // forward by id and never re-process the same row. orderBy id ASC keeps
  // the order deterministic so cursor-based paging is correct.
  for (;;) {
    const batch = await db.job.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      where: { requiredLanguages: { isEmpty: true } },
      select: {
        id: true,
        content: true,
      },
    });
    if (batch.length === 0) break;

    await runWithConcurrency(batch, flags.concurrency, async (job) => {
      processed += 1;
      try {
        // Content may be null on rows imported from older sources — treat
        // those as "no requirements found" rather than crashing the run.
        const languages = extractRequiredLanguages(job.content ?? "");
        if (languages.length === 0) return;

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
      } catch (err) {
        // Error tolerance: log and move on. A single malformed row should
        // never abort a 100k-row backfill — the operator can re-run with
        // --from-cursor=<id> to pick up where we left off.
        errors += 1;
        console.error(
          `[backfill] error on job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    // Throttled progress log with rate + ETA. Computed off the current
    // processed count rather than `i` so concurrency doesn't skew the rate.
    if (processed - lastProgressMilestone >= PROGRESS_LOG_INTERVAL) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = elapsedSec > 0 ? processed / elapsedSec : 0;
      const remaining = Math.max(0, total - processed);
      const eta = rate > 0 ? remaining / rate : Number.POSITIVE_INFINITY;
      const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : "?";
      console.log(
        `[backfill] ${processed}/${total} (${pct}%) · ${rate.toFixed(0)} jobs/sec · ETA ${formatEta(eta)}`,
      );
      lastProgressMilestone = processed;
    }

    cursor = batch[batch.length - 1].id;

    // Periodically log the cursor so a crashed run can resume cleanly.
    // Emitted on its own line so an `awk`/`grep` over the log can recover
    // the last known-good resume point.
    if (processed - lastCursorMilestone >= CURSOR_LOG_INTERVAL) {
      console.log(`[backfill] cursor=${cursor}`);
      lastCursorMilestone = processed;
    }

    if (batch.length < BATCH_SIZE) break;
  }

  const elapsedSec = (Date.now() - startTime) / 1000;
  console.log(
    `[backfill] done. processed=${processed} updated=${updated} withRequirements=${withRequirements} errors=${errors} elapsed=${formatEta(elapsedSec)} lastCursor=${cursor ?? "n/a"}`,
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
