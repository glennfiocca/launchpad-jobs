#!/usr/bin/env tsx
/**
 * Greenhouse Board Token Discovery Pipeline
 *
 * Discovers new Greenhouse board tokens from multiple sources and optionally
 * ingests them into the CompanyBoard table.
 *
 * Usage:
 *   npx tsx scripts/discovery/run-discovery.ts [options]
 *
 * Options:
 *   --source=all|companies|github|careers   Which source to run (default: all)
 *   --dry-run                               Validate only, don't write to DB
 *   --output-dir=<path>                     Where to save results JSON (default: scripts/discovery/)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { RateLimiter } from "./rate-limiter";
import { TokenValidator } from "./validate-token";
import type { ValidatedBoard, ValidationResult } from "./validate-token";
import { getExistingTokens, ingestBoards, disconnect, saveResults } from "./ingest";
import type { DiscoveryResultFile } from "./ingest";
import { discoverFromCompanyLists } from "./source-company-lists";
import { discoverFromGitHub } from "./source-github";
import { discoverFromCareerPages } from "./source-career-pages";

type SourceType = "all" | "companies" | "github" | "careers";

interface CliArgs {
  readonly source: SourceType;
  readonly dryRun: boolean;
  readonly outputDir: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let source: SourceType = "all";
  let dryRun = false;
  let outputDir = path.join(__dirname);

  for (const arg of args) {
    if (arg.startsWith("--source=")) {
      const value = arg.split("=")[1] as SourceType;
      if (["all", "companies", "github", "careers"].includes(value)) {
        source = value;
      } else {
        console.error(`Invalid source: ${value}. Use: all, companies, github, careers`);
        process.exit(1);
      }
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("--output-dir=")) {
      outputDir = arg.split("=")[1];
    }
  }

  return { source, dryRun, outputDir };
}

function makeProgressLogger(
  sourceName: string
): (completed: number, total: number, current: string) => void {
  let lastPercent = -1;
  return (completed: number, total: number, current: string) => {
    const percent = Math.floor((completed / total) * 100);
    if (percent !== lastPercent && percent % 5 === 0) {
      lastPercent = percent;
      console.log(`[${sourceName}] ${percent}% (${completed}/${total}) - ${current}`);
    }
  };
}

// Minimum job count to avoid noise from generic/dead boards
const MIN_JOB_COUNT = 3;

// Generic single-word tokens that match false positives
const GENERIC_TOKEN_BLOCKLIST = new Set([
  "global", "us", "remote", "general", "international",
  "journey", "universal", "the", "jobs", "career", "careers",
]);

function collectValidBoards(
  results: readonly ValidationResult[]
): readonly ValidatedBoard[] {
  return results
    .filter((r): r is ValidationResult & { board: ValidatedBoard } => r.valid && r.board !== null)
    .filter((r) => r.board.jobCount >= MIN_JOB_COUNT)
    .filter((r) => !GENERIC_TOKEN_BLOCKLIST.has(r.board.token))
    .map((r) => r.board);
}

function printSummary(
  allResults: readonly ValidationResult[],
  validBoards: readonly ValidatedBoard[],
  dryRun: boolean
): void {
  const alreadyKnown = allResults.filter((r) => r.error === "already_known").length;
  const notFound = allResults.filter((r) => r.error === "not_found").length;
  const noJobs = allResults.filter((r) => r.error === "no_active_jobs").length;
  const errors = allResults.filter(
    (r) => r.error && !["already_known", "not_found", "no_active_jobs"].includes(r.error)
  ).length;

  console.log("\n" + "=".repeat(60));
  console.log("DISCOVERY SUMMARY");
  console.log("=".repeat(60));
  console.log(`Candidates tested:  ${allResults.length}`);
  console.log(`Already known:      ${alreadyKnown}`);
  console.log(`Not found (404):    ${notFound}`);
  console.log(`No active jobs:     ${noJobs}`);
  console.log(`Errors:             ${errors}`);
  console.log(`Valid & new:        ${validBoards.length}`);
  console.log("");

  if (validBoards.length > 0) {
    console.log("NEW BOARDS DISCOVERED:");
    console.log("-".repeat(60));

    const sorted = [...validBoards].sort((a, b) => b.jobCount - a.jobCount);
    for (const board of sorted) {
      console.log(`  ${board.token.padEnd(35)} ${board.name.padEnd(30)} ${board.jobCount} jobs`);
    }

    const totalJobs = validBoards.reduce((sum, b) => sum + b.jobCount, 0);
    console.log("-".repeat(60));
    console.log(`  Total: ${validBoards.length} boards, ${totalJobs} jobs`);
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes written to database.");
  }
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log("=".repeat(60));
  console.log("Greenhouse Board Token Discovery Pipeline");
  console.log("=".repeat(60));
  console.log(`Source:    ${args.source}`);
  console.log(`Dry run:   ${args.dryRun}`);
  console.log(`Output:    ${args.outputDir}`);
  console.log("");

  // Load existing tokens for dedup
  console.log("Loading existing board tokens...");
  const existingTokens = await getExistingTokens();
  console.log(`Found ${existingTokens.size} existing tokens in database`);

  // Also add SEED_BOARDS tokens that might not be in DB yet
  try {
    const { SEED_BOARDS } = await import("../../src/lib/greenhouse/sync");
    for (const board of SEED_BOARDS) {
      existingTokens.add(board.token.toLowerCase());
    }
    console.log(`After adding SEED_BOARDS: ${existingTokens.size} known tokens`);
  } catch {
    console.warn("Could not load SEED_BOARDS, using DB tokens only");
  }

  const rateLimiter = new RateLimiter();
  const validator = new TokenValidator(existingTokens, rateLimiter);

  const allResults: ValidationResult[] = [];

  // Run selected sources
  if (args.source === "all" || args.source === "companies") {
    console.log("\n--- Source A: Company Lists ---");
    const result = await discoverFromCompanyLists(
      validator,
      makeProgressLogger("companies")
    );
    allResults.push(...result.results);
    console.log(`Company lists: ${result.results.length} candidates tested`);
  }

  if (args.source === "all" || args.source === "github") {
    console.log("\n--- Source B: GitHub Mining ---");
    const result = await discoverFromGitHub(
      validator,
      makeProgressLogger("github")
    );
    allResults.push(...result.results);
    console.log(`GitHub: ${result.results.length} candidates tested`);
  }

  if (args.source === "all" || args.source === "careers") {
    console.log("\n--- Source C: Career Pages ---");
    const result = await discoverFromCareerPages(
      validator,
      undefined,
      makeProgressLogger("careers")
    );
    allResults.push(...result.results);
    console.log(`Career pages: ${result.results.length} candidates tested`);
  }

  // Collect valid boards
  const validBoards = collectValidBoards(allResults);

  // Print summary
  printSummary(allResults, validBoards, args.dryRun);

  // Save results to JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const resultFile: DiscoveryResultFile = {
    timestamp,
    source: args.source,
    stats: {
      candidatesTested: allResults.length,
      valid: validBoards.length,
      netNew: validBoards.length,
      withActiveJobs: validBoards.length,
    },
    boards: validBoards,
  };

  const savedPath = saveResults(resultFile, args.outputDir);
  console.log(`\nResults saved to: ${savedPath}`);

  // Ingest to database (unless dry run)
  if (!args.dryRun && validBoards.length > 0) {
    console.log("\nIngesting discovered boards into database...");
    const { created, skipped } = await ingestBoards(validBoards);
    console.log(`Ingested: ${created} created, ${skipped} skipped`);
  }

  await disconnect();
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Discovery pipeline failed:", error);
  disconnect().finally(() => process.exit(1));
});
