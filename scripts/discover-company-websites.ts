/**
 * Bulk-discover company websites by scraping each company's ATS job board.
 *
 * For each Company in the DB:
 *   1. Skip if there's a curated override (overrides win unconditionally)
 *   2. Build the ATS board URL from provider + slug/boardToken
 *   3. Fetch the page, extract the canonical website using provider-
 *      specific HTML patterns (see src/lib/website-discovery/)
 *   4. Compare against current Company.website (normalized) — only flag
 *      changes
 *   5. With --apply: update Company.website + clear Company.logoUrl so
 *      the next render re-resolves the logo from the new website
 *
 * Idempotent — re-running just no-ops on rows that already match.
 *
 * After discovery, run `npm run backfill-company-logos -- --force-logo
 * --apply` to re-cache every company's logo against the new websites.
 *
 * Usage:
 *   npx tsx scripts/discover-company-websites.ts            # dry-run, all
 *   npx tsx scripts/discover-company-websites.ts --apply
 *   npx tsx scripts/discover-company-websites.ts --slug=okta --apply
 *   npx tsx scripts/discover-company-websites.ts --provider=ASHBY --apply
 *   npx tsx scripts/discover-company-websites.ts --concurrency=8
 */

import "dotenv/config";
import type { AtsProvider } from "@prisma/client";
import { db } from "../src/lib/db";
import { discoverWebsite } from "../src/lib/website-discovery";
import { discoverGreenhouseViaBrowser } from "../src/lib/website-discovery/greenhouse";
import { lookupLogoOverride } from "../src/lib/company-logo";

interface CliFlags {
  apply: boolean;
  slug: string | null;
  provider: AtsProvider | null;
  concurrency: number;
  browser: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, slug: null, provider: null, concurrency: 6, browser: false };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg === "--browser") flags.browser = true;
    else if (arg.startsWith("--slug=")) flags.slug = arg.slice("--slug=".length);
    else if (arg.startsWith("--provider=")) {
      const v = arg.slice("--provider=".length).toUpperCase();
      if (v === "GREENHOUSE" || v === "ASHBY") flags.provider = v;
    } else if (arg.startsWith("--concurrency=")) {
      const n = Number.parseInt(arg.slice("--concurrency=".length), 10);
      if (Number.isFinite(n) && n > 0 && n <= 32) flags.concurrency = n;
    }
  }
  return flags;
}

interface DiscoveryRow {
  id: string;
  slug: string;
  provider: AtsProvider;
  name: string;
  before: string | null;
  after: string | null;
  source: "ashby" | "greenhouse" | "override-skip" | "miss";
  changed: boolean;
}

function normalizeHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function deriveBoardToken(provider: AtsProvider, slug: string): string {
  if (provider === "GREENHOUSE") return slug;
  return slug.replace(/^ashby-/, "");
}

async function processBatch(
  rows: Array<{
    id: string;
    slug: string;
    provider: AtsProvider;
    name: string;
    website: string | null;
    jobExternalId: string | null;
  }>,
): Promise<DiscoveryRow[]> {
  return Promise.all(
    rows.map(async (c) => {
      // Curated override always wins — skip discovery entirely.
      const override = await lookupLogoOverride(c.provider, c.slug);
      if (override?.website) {
        return {
          id: c.id,
          slug: c.slug,
          provider: c.provider,
          name: c.name,
          before: c.website,
          after: override.website,
          source: "override-skip",
          changed: normalizeHost(c.website) !== normalizeHost(override.website),
        };
      }

      const boardToken = deriveBoardToken(c.provider, c.slug);
      // For Greenhouse, pass an active job's external ID so discovery
      // hits a real per-job page (~80-150 KB of SEO-friendly HTML) rather
      // than the JS-rendered board index. Hugely more reliable.
      const result = await discoverWebsite(
        c.provider,
        boardToken,
        c.jobExternalId ?? undefined,
      );

      const after = result.website;
      const changed = after !== null && normalizeHost(c.website) !== normalizeHost(after);

      return {
        id: c.id,
        slug: c.slug,
        provider: c.provider,
        name: c.name,
        before: c.website,
        after,
        source: result.source === "none" ? "miss" : result.source,
        changed,
      };
    }),
  );
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);
  if (flags.slug) console.log(`Scope: slug=${flags.slug}`);
  if (flags.provider) console.log(`Scope: provider=${flags.provider}`);
  console.log(`Concurrency: ${flags.concurrency}\n`);

  const where: Record<string, unknown> = {};
  if (flags.slug) where.slug = flags.slug;
  if (flags.provider) where.provider = flags.provider;

  const rawCompanies = await db.company.findMany({
    where,
    select: {
      id: true,
      slug: true,
      provider: true,
      name: true,
      website: true,
      // One active job per company is enough — used as the SEO-rich
      // per-job page target for Greenhouse discovery.
      jobs: {
        where: { isActive: true },
        select: { externalId: true },
        take: 1,
      },
    },
    orderBy: { id: "asc" },
  });

  const companies = rawCompanies.map((c) => ({
    id: c.id,
    slug: c.slug,
    provider: c.provider,
    name: c.name,
    website: c.website,
    jobExternalId: c.jobs[0]?.externalId ?? null,
  }));

  console.log(`Scanning ${companies.length.toLocaleString()} companies...\n`);

  const results: DiscoveryRow[] = [];
  for (let i = 0; i < companies.length; i += flags.concurrency) {
    const batch = companies.slice(i, i + flags.concurrency);
    const batchResults = await processBatch(batch);
    results.push(...batchResults);
    if ((i + flags.concurrency) % 60 < flags.concurrency) {
      console.log(`  scanned ${Math.min(i + flags.concurrency, companies.length)} / ${companies.length}`);
    }
  }

  // Browser fallback: re-attempt the misses with a real Chromium page.
  // Slow but robust against CloudFront WAF and JS-rendered templates.
  if (flags.browser) {
    const misses = results.filter((r) => r.source === "miss" && r.provider === "GREENHOUSE");
    if (misses.length > 0) {
      console.log(`\nRetrying ${misses.length} GH misses via browser...`);
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
      });
      // Index by id so we can retrieve each miss's job-external-id.
      const jobIdById = new Map(companies.map((c) => [c.id, c.jobExternalId]));
      try {
        let recovered = 0;
        let i = 0;
        for (const row of misses) {
          i++;
          const page = await context.newPage();
          try {
            const boardToken = deriveBoardToken(row.provider, row.slug);
            const jobExternalId = jobIdById.get(row.id) ?? undefined;
            // Per-page hard timeout to avoid the indefinite hang we hit
            // earlier — kills any single board that won't respond.
            const website = await Promise.race<string | null>([
              discoverGreenhouseViaBrowser(boardToken, page, jobExternalId),
              new Promise((resolve) => setTimeout(() => resolve(null), 25_000)),
            ]);
            if (website) {
              row.after = website;
              row.source = "greenhouse";
              row.changed = normalizeHost(row.before) !== normalizeHost(website);
              recovered++;
            }
          } finally {
            await page.close();
          }
          if (i % 20 === 0) console.log(`  browser progress: ${i}/${misses.length} (${recovered} recovered)`);
        }
        console.log(`  browser recovered: ${recovered}/${misses.length}`);
      } finally {
        await context.close();
        await browser.close();
      }
    }
  }

  // Tally
  const tally = { ashby: 0, greenhouse: 0, override: 0, miss: 0 };
  let changes = 0;
  for (const r of results) {
    if (r.source === "ashby") tally.ashby++;
    else if (r.source === "greenhouse") tally.greenhouse++;
    else if (r.source === "override-skip") tally.override++;
    else tally.miss++;
    if (r.changed) changes++;
  }

  console.log("\nDiscovery source distribution:");
  console.log(`  ashby            ${String(tally.ashby).padStart(5)}`);
  console.log(`  greenhouse       ${String(tally.greenhouse).padStart(5)}`);
  console.log(`  override (skip)  ${String(tally.override).padStart(5)}`);
  console.log(`  miss             ${String(tally.miss).padStart(5)}`);
  console.log(`\nWebsite changes proposed: ${changes.toLocaleString()}`);

  // Sample diffs
  const diffs = results.filter((r) => r.changed && r.source !== "override-skip");
  if (diffs.length > 0) {
    console.log(`\nSample of ${Math.min(30, diffs.length)} discovered changes:`);
    for (const r of diffs.slice(0, 30)) {
      console.log(`  [${r.source}] ${r.name} (${r.slug})`);
      console.log(`    ${r.before ?? "(null)"}\n    → ${r.after ?? "(null)"}`);
    }
  }

  // List misses (high-signal — these are GH boards that need Playwright)
  const misses = results.filter((r) => r.source === "miss");
  if (misses.length > 0) {
    console.log(`\nMisses (${misses.length} — likely need Playwright fallback):`);
    for (const m of misses.slice(0, 20)) {
      console.log(`  ${m.provider}/${m.slug}: ${m.name}`);
    }
    if (misses.length > 20) console.log(`  … and ${misses.length - 20} more`);
  }

  if (!flags.apply) {
    console.log("\nDry-run only — re-run with --apply to commit.");
    await db.$disconnect();
    return;
  }

  if (changes === 0) {
    console.log("\nNothing to apply.");
    await db.$disconnect();
    return;
  }

  console.log("\nApplying website changes (logoUrl will be cleared so next backfill re-caches)...");
  let applied = 0;
  const BATCH = 50;
  for (let i = 0; i < results.length; i += BATCH) {
    const slice = results.slice(i, i + BATCH).filter((r) => r.changed && r.after !== null && r.source !== "override-skip");
    if (slice.length === 0) continue;
    await db.$transaction(
      async (tx) => {
        for (const r of slice) {
          await tx.company.update({
            where: { id: r.id },
            data: { website: r.after, logoUrl: null },
          });
        }
      },
      { timeout: 30_000 },
    );
    applied += slice.length;
    console.log(`  applied ${applied}`);
  }

  console.log(`\nDone: ${applied} websites updated. Run npm run backfill-company-logos -- --apply next to re-cache logos.`);
  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
