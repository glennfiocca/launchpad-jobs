/**
 * Track A.5.1 — Greenhouse apply-URL parity spot-check.
 *
 * Sample 10 random distinct Greenhouse companies that have at least one active
 * Job, then headlessly navigate to each Job's applyUrl (falling back to
 * absoluteUrl). Verify a form / email input / Greenhouse iframe mounts within
 * 10s. Print a markdown table.
 *
 * Read-only. Does not auth, fill, click, or POST anything.
 *
 * Usage:
 *   npx tsx scripts/audit-greenhouse-apply-parity.ts
 *
 * Exit codes:
 *   0 — 0 or 1 failures (≤10% — track A.5 closed)
 *   1 — 2+ failures (>10% — Track A.6 follow-on warranted)
 */

import "dotenv/config";
import { chromium, type Browser } from "playwright";
import { db } from "../src/lib/db";

interface SampleRow {
  companyId: string;
  companyName: string;
  jobId: string;
  applyUrl: string | null;
  absoluteUrl: string | null;
}

type Outcome = "OK" | "NO_FORM" | "TIMEOUT" | "ERROR";

interface AuditResult {
  company: string;
  url: string;
  status: Outcome;
  note?: string;
}

const SAMPLE_SIZE = 10;
const PER_BOARD_TIMEOUT_MS = 10_000;
const OVERALL_TIMEOUT_MS = 60_000 * 3; // 3 min hard ceiling

async function checkOne(browser: Browser, sample: SampleRow): Promise<AuditResult> {
  const url = sample.applyUrl ?? sample.absoluteUrl;
  if (!url) {
    return {
      company: sample.companyName,
      url: "(none)",
      status: "ERROR",
      note: "no applyUrl or absoluteUrl",
    };
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PER_BOARD_TIMEOUT_MS });

    // Race three locator probes; first one that resolves wins. Each probe
    // is bounded by PER_BOARD_TIMEOUT_MS so the whole race ends in ≤10s.
    const probes = [
      page.locator("form").first().waitFor({ state: "attached", timeout: PER_BOARD_TIMEOUT_MS }),
      page
        .locator('input[autocomplete="email"], input[name*="email" i], textarea[name*="email" i]')
        .first()
        .waitFor({ state: "attached", timeout: PER_BOARD_TIMEOUT_MS }),
      page
        .locator('iframe[src*="greenhouse"]')
        .first()
        .waitFor({ state: "attached", timeout: PER_BOARD_TIMEOUT_MS }),
    ];

    try {
      await Promise.any(probes);
      return {
        company: sample.companyName,
        url,
        status: "OK",
      };
    } catch {
      return {
        company: sample.companyName,
        url,
        status: "NO_FORM",
        note: "no form / email input / greenhouse iframe within 10s",
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout/i.test(msg);
    return {
      company: sample.companyName,
      url,
      status: isTimeout ? "TIMEOUT" : "ERROR",
      note: msg.split("\n")[0]?.slice(0, 140),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function renderMarkdown(rows: AuditResult[]): string {
  const header =
    "| # | Company | Status | URL | Note |\n" +
    "|---|---------|--------|-----|------|";
  const body = rows
    .map((r, i) => {
      const url = r.url.length > 80 ? r.url.slice(0, 77) + "..." : r.url;
      const note = (r.note ?? "").replace(/\|/g, "\\|");
      const company = r.company.replace(/\|/g, "\\|");
      return `| ${i + 1} | ${company} | ${r.status} | ${url} | ${note} |`;
    })
    .join("\n");
  return `${header}\n${body}`;
}

async function main(): Promise<void> {
  const overallTimer = setTimeout(() => {
    console.error("Overall 3-min safety timeout hit — aborting.");
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);
  overallTimer.unref();

  // The Job table may or may not have an `applyUrl` column depending on
  // whether the latest migration has run. Detect first and adapt the SELECT
  // accordingly so the script works on any synced dev DB.
  const hasApplyUrl =
    (
      await db.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Job' AND column_name = 'applyUrl'
        ) AS "exists"
      `
    )[0]?.exists ?? false;

  // DISTINCT ON (c.id) gives one row per company; ORDER BY c.id, RANDOM()
  // selects a random Job per company. Wrapped in an outer query to randomize
  // *which* companies get sampled (otherwise we'd always get the lowest 10
  // company IDs).
  const samples = hasApplyUrl
    ? await db.$queryRaw<SampleRow[]>`
        SELECT * FROM (
          SELECT DISTINCT ON (c.id)
            c.id            AS "companyId",
            c.name          AS "companyName",
            j.id            AS "jobId",
            j."applyUrl"    AS "applyUrl",
            j."absoluteUrl" AS "absoluteUrl"
          FROM "Job" j
          JOIN "Company" c ON c.id = j."companyId"
          WHERE c.provider = 'GREENHOUSE'
            AND j."isActive" = true
          ORDER BY c.id, RANDOM()
        ) per_company
        ORDER BY RANDOM()
        LIMIT ${SAMPLE_SIZE}
      `
    : await db.$queryRaw<SampleRow[]>`
        SELECT * FROM (
          SELECT DISTINCT ON (c.id)
            c.id            AS "companyId",
            c.name          AS "companyName",
            j.id            AS "jobId",
            NULL            AS "applyUrl",
            j."absoluteUrl" AS "absoluteUrl"
          FROM "Job" j
          JOIN "Company" c ON c.id = j."companyId"
          WHERE c.provider = 'GREENHOUSE'
            AND j."isActive" = true
          ORDER BY c.id, RANDOM()
        ) per_company
        ORDER BY RANDOM()
        LIMIT ${SAMPLE_SIZE}
      `;

  if (samples.length === 0) {
    console.log("no Greenhouse jobs available; skipping audit");
    await db.$disconnect();
    clearTimeout(overallTimer);
    process.exit(0);
  }

  console.log(`Sampled ${samples.length} Greenhouse companies. Launching Chromium...\n`);

  const browser = await chromium.launch({ headless: true });
  const results: AuditResult[] = [];

  try {
    // Sequential by design — each navigation is bounded at 10s. Parallel
    // would risk overwhelming hosted boards or tripping rate limits.
    for (const sample of samples) {
      const result = await checkOne(browser, sample);
      console.log(`  [${result.status.padEnd(7)}] ${result.company} → ${result.url}`);
      if (result.note) console.log(`            ${result.note}`);
      results.push(result);
    }
  } finally {
    await browser.close().catch(() => {});
    await db.$disconnect().catch(() => {});
    clearTimeout(overallTimer);
  }

  console.log("\n## Greenhouse Apply-URL Parity Audit\n");
  console.log(renderMarkdown(results));

  const okCount = results.filter((r) => r.status === "OK").length;
  const failCount = results.length - okCount;
  console.log(`\nPass: ${okCount}/${results.length}  Fail: ${failCount}/${results.length}`);

  if (failCount >= 2) {
    console.log("Verdict: 2+ failures — file Track A.6 follow-on.");
    process.exit(1);
  } else {
    console.log("Verdict: ≤1 failure — Track A.5 can be closed.");
    process.exit(0);
  }
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
