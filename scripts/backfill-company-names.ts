/**
 * Backfills canonical Company.name and CompanyBoard.name values using the
 * resolver in src/lib/company-name/.
 *
 * Default mode is dry-run — prints a diff of every row that would change
 * but writes nothing. Pass --apply to commit the changes.
 *
 * Usage:
 *   npx tsx scripts/backfill-company-names.ts            # dry-run
 *   npx tsx scripts/backfill-company-names.ts --apply    # apply changes
 *   npx tsx scripts/backfill-company-names.ts --only=companies   # one table
 *   npx tsx scripts/backfill-company-names.ts --only=boards
 */

import "dotenv/config";
import type { AtsProvider } from "@prisma/client";
import { db } from "../src/lib/db";
import { resolveCompanyName } from "../src/lib/company-name";

interface CliFlags {
  apply: boolean;
  only: "all" | "companies" | "boards";
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { apply: false, only: "all" };
  for (const arg of argv) {
    if (arg === "--apply") flags.apply = true;
    else if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      if (value !== "all" && value !== "companies" && value !== "boards") {
        throw new Error(`Invalid --only value: ${value}`);
      }
      flags.only = value;
    }
  }
  return flags;
}

interface DiffRow {
  table: "company" | "board";
  id: string;
  provider: AtsProvider;
  slug: string;
  before: string;
  after: string;
  source: string;
}

async function diffCompanies(): Promise<DiffRow[]> {
  const companies = await db.company.findMany({
    select: { id: true, name: true, slug: true, provider: true },
  });

  const diffs: DiffRow[] = [];
  for (const c of companies) {
    const result = resolveCompanyName({
      provider: c.provider,
      slug: c.slug,
      rawName: c.name,
    });
    if (result.name !== c.name) {
      diffs.push({
        table: "company",
        id: c.id,
        provider: c.provider,
        slug: c.slug,
        before: c.name,
        after: result.name,
        source: result.source,
      });
    }
  }
  return diffs;
}

async function diffBoards(): Promise<DiffRow[]> {
  const boards = await db.companyBoard.findMany({
    select: { id: true, name: true, boardToken: true, provider: true },
  });

  const diffs: DiffRow[] = [];
  for (const b of boards) {
    // CompanyBoard stores the raw boardToken; the resolver expects the
    // provider-prefixed slug for Ashby. Construct the same slug shape that
    // src/lib/ats/sync.ts uses so override lookups behave identically.
    const slug = b.provider === "GREENHOUSE" ? b.boardToken : `${b.provider.toLowerCase()}-${b.boardToken}`;
    const result = resolveCompanyName({
      provider: b.provider,
      slug,
      rawName: b.name,
    });
    if (result.name !== b.name) {
      diffs.push({
        table: "board",
        id: b.id,
        provider: b.provider,
        slug,
        before: b.name,
        after: result.name,
        source: result.source,
      });
    }
  }
  return diffs;
}

function printDiffs(diffs: readonly DiffRow[]): void {
  if (diffs.length === 0) {
    console.log("  (no changes)");
    return;
  }

  // Group by source so it's easy to spot how each fix was reached.
  const bySource = new Map<string, DiffRow[]>();
  for (const d of diffs) {
    const list = bySource.get(d.source) ?? [];
    list.push(d);
    bySource.set(d.source, list);
  }

  for (const [source, rows] of bySource) {
    console.log(`\n  Source: ${source}  (${rows.length})`);
    for (const r of rows) {
      console.log(
        `    [${r.table}] ${r.provider}/${r.slug}: "${r.before}" → "${r.after}"`,
      );
    }
  }
}

async function applyDiffs(diffs: readonly DiffRow[]): Promise<void> {
  // Use a transaction so a partial failure doesn't leave the DB half-updated.
  await db.$transaction(async (tx) => {
    for (const d of diffs) {
      if (d.table === "company") {
        await tx.company.update({ where: { id: d.id }, data: { name: d.after } });
      } else {
        await tx.companyBoard.update({ where: { id: d.id }, data: { name: d.after } });
      }
    }
  });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);
  console.log(`Scope: ${flags.only}\n`);

  const allDiffs: DiffRow[] = [];

  if (flags.only === "all" || flags.only === "companies") {
    console.log("Scanning Company table...");
    const diffs = await diffCompanies();
    printDiffs(diffs);
    allDiffs.push(...diffs);
  }

  if (flags.only === "all" || flags.only === "boards") {
    console.log("\nScanning CompanyBoard table...");
    const diffs = await diffBoards();
    printDiffs(diffs);
    allDiffs.push(...diffs);
  }

  console.log(`\nTotal changes: ${allDiffs.length}`);

  if (flags.apply && allDiffs.length > 0) {
    console.log("\nApplying...");
    await applyDiffs(allDiffs);
    console.log("Done.");
  } else if (!flags.apply && allDiffs.length > 0) {
    console.log("\nRe-run with --apply to commit these changes.");
  }

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
