/**
 * One-shot seeder: import TheirStack discovery results into the DB.
 *
 * Reads two CSVs produced by the YOLO derive pipeline:
 *   - hits_deduped.csv  -> upserts into CompanyBoard
 *   - misses.csv        -> upserts into BoardReviewMiss
 *
 * Idempotent. Dry-run by default; commits with --apply.
 *
 * Usage:
 *   npx tsx scripts/seed-from-theirstack.ts            # dry-run
 *   npx tsx scripts/seed-from-theirstack.ts --apply    # commit
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import type { AtsProvider, Prisma } from "@prisma/client";

interface CliFlags {
  apply: boolean;
}

interface HitRow extends Record<string, string> {
  ats: string;
  slug: string;
  primary_name: string;
  all_names: string;
  api_jobs: string;
  company_url: string;
  country_code: string;
  industry: string;
  linkedin_url: string;
}

interface MissRow extends Record<string, string> {
  company_name: string;
  company_url: string;
  linkedin_url: string;
  country_code: string;
  total_jobs_ts: string;
  industry: string;
  candidates_tried: string;
}

const HITS_CSV = "/Users/glennfiocca/YOLO/derive_output/hits_deduped.csv";
const MISSES_CSV = "/Users/glennfiocca/YOLO/derive_output/misses.csv";
const SUSPICIOUS_SLUG_LEN = 7;
const SUSPICIOUS_JOBS_MAX = 5;
const PROGRESS_EVERY = 250;

function parseFlags(argv: readonly string[]): CliFlags {
  return { apply: argv.includes("--apply") };
}

// Minimal CSV parser: the input CSVs were produced by Python's csv writer
// with no embedded newlines inside quoted fields, so split-on-newline is
// safe. Quotes around a field are stripped; doubled quotes ("") collapse.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv<T extends Record<string, string>>(path: string): T[] {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: T[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = cols[j] ?? "";
    rows.push(row as T);
  }
  return rows;
}

function mapAts(raw: string): AtsProvider | null {
  const v = raw.trim().toLowerCase();
  if (v === "greenhouse") return "GREENHOUSE";
  if (v === "ashby") return "ASHBY";
  return null;
}

function firstAllName(allNames: string): string {
  const piece = allNames.split("|")[0]?.trim() ?? "";
  return piece;
}

function toIntOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function nullIfEmpty(raw: string): string | null {
  const t = raw.trim();
  return t.length === 0 ? null : t;
}

interface BoardPlan {
  provider: AtsProvider;
  boardToken: string;
  name: string;
  website: string | null;
  suspiciousSlug: boolean;
}

function planBoard(row: HitRow): BoardPlan | null {
  const provider = mapAts(row.ats);
  if (!provider) return null;
  const slug = row.slug.trim();
  if (slug.length === 0) return null;
  const name = row.primary_name.trim() || firstAllName(row.all_names) || slug;
  const apiJobs = toIntOrNull(row.api_jobs) ?? 0;
  const suspiciousSlug = slug.length <= SUSPICIOUS_SLUG_LEN && apiJobs <= SUSPICIOUS_JOBS_MAX;
  return {
    provider,
    boardToken: slug,
    name,
    website: nullIfEmpty(row.company_url),
    suspiciousSlug,
  };
}

async function upsertBoard(p: BoardPlan): Promise<void> {
  const update: Prisma.CompanyBoardUpdateInput = {
    name: p.name,
    website: p.website,
    suspiciousSlug: p.suspiciousSlug,
  };
  const create: Prisma.CompanyBoardCreateInput = {
    name: p.name,
    boardToken: p.boardToken,
    provider: p.provider,
    website: p.website,
    isActive: true,
    reviewStatus: "PENDING",
    suspiciousSlug: p.suspiciousSlug,
  };
  await db.companyBoard.upsert({
    where: { provider_boardToken: { provider: p.provider, boardToken: p.boardToken } },
    update,
    create,
  });
}

async function upsertMiss(row: MissRow): Promise<void> {
  const name = row.company_name.trim();
  if (name.length === 0) return;
  // On update: refresh discovery fields only; never overwrite reviewStatus
  // or manuallyProvided* (admins may have already acted).
  const update: Prisma.BoardReviewMissUpdateInput = {
    companyUrl: nullIfEmpty(row.company_url),
    linkedinUrl: nullIfEmpty(row.linkedin_url),
    countryCode: nullIfEmpty(row.country_code),
    totalJobsTs: toIntOrNull(row.total_jobs_ts),
    industry: nullIfEmpty(row.industry),
    candidatesTried: nullIfEmpty(row.candidates_tried),
  };
  const create: Prisma.BoardReviewMissCreateInput = {
    companyName: name,
    companyUrl: nullIfEmpty(row.company_url),
    linkedinUrl: nullIfEmpty(row.linkedin_url),
    countryCode: nullIfEmpty(row.country_code),
    totalJobsTs: toIntOrNull(row.total_jobs_ts),
    industry: nullIfEmpty(row.industry),
    candidatesTried: nullIfEmpty(row.candidates_tried),
    reviewStatus: "PENDING",
  };
  await db.boardReviewMiss.upsert({ where: { companyName: name }, update, create });
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`Mode: ${flags.apply ? "APPLY" : "dry-run"}`);

  const hits = parseCsv<HitRow>(HITS_CSV);
  const misses = parseCsv<MissRow>(MISSES_CSV);
  console.log(`Parsed ${hits.length} hits, ${misses.length} misses\n`);

  const boardPlans: BoardPlan[] = [];
  let skippedHits = 0;
  for (const h of hits) {
    const p = planBoard(h);
    if (!p) {
      skippedHits++;
      continue;
    }
    boardPlans.push(p);
  }
  const suspicious = boardPlans.filter((b) => b.suspiciousSlug);
  console.log(`Plan: ${boardPlans.length} CompanyBoard upserts (${skippedHits} skipped)`);
  console.log(`Plan: ${misses.length} BoardReviewMiss upserts`);
  console.log(`Flagged suspiciousSlug=true: ${suspicious.length}\n`);

  console.log("Sample of suspiciousSlug=true candidates:");
  for (const s of suspicious.slice(0, 15)) {
    console.log(`  ${s.provider.padEnd(10)} ${s.boardToken.padEnd(10)} ${s.name}`);
  }
  if (suspicious.length > 15) console.log(`  ...and ${suspicious.length - 15} more`);
  console.log();

  if (!flags.apply) {
    console.log(
      `DRY RUN: would upsert ${boardPlans.length} CompanyBoard rows, ${misses.length} BoardReviewMiss rows.`,
    );
    console.log("Re-run with --apply to commit.");
    return;
  }

  console.log("Applying CompanyBoard upserts...");
  for (let i = 0; i < boardPlans.length; i++) {
    await upsertBoard(boardPlans[i]);
    if ((i + 1) % PROGRESS_EVERY === 0) {
      console.log(`  ${i + 1}/${boardPlans.length} boards`);
    }
  }
  console.log(`Done: ${boardPlans.length} CompanyBoard upserts.\n`);

  console.log("Applying BoardReviewMiss upserts...");
  let missDone = 0;
  for (let i = 0; i < misses.length; i++) {
    await upsertMiss(misses[i]);
    missDone++;
    if (missDone % PROGRESS_EVERY === 0) {
      console.log(`  ${missDone}/${misses.length} misses`);
    }
  }
  console.log(`Done: ${missDone} BoardReviewMiss upserts.\n`);

  // Post-apply tally so the user can confirm.
  const [ghPending, ashPending, missTotal, boardTotal] = await Promise.all([
    db.companyBoard.count({ where: { provider: "GREENHOUSE", reviewStatus: "PENDING" } }),
    db.companyBoard.count({ where: { provider: "ASHBY", reviewStatus: "PENDING" } }),
    db.boardReviewMiss.count(),
    db.companyBoard.count(),
  ]);
  console.log("--- DB row counts (post-apply) ---");
  console.log(`CompanyBoard total:                  ${boardTotal}`);
  console.log(`CompanyBoard GREENHOUSE + PENDING:   ${ghPending}`);
  console.log(`CompanyBoard ASHBY      + PENDING:   ${ashPending}`);
  console.log(`BoardReviewMiss total:               ${missTotal}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
