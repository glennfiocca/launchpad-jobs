/**
 * Source A: Discover Greenhouse board tokens from curated company lists.
 * Loads S&P 500, Forbes Cloud 100, and YC companies, generates slug variants,
 * and validates each against the Greenhouse API.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { generateSlugs } from "./slug-generator";
import type { TokenValidator, ValidationResult } from "./validate-token";

const DATA_DIR = path.join(__dirname, "data");

function loadCompanyList(filename: string): readonly string[] {
  const filepath = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(filepath, "utf-8");
  return JSON.parse(content) as string[];
}

function deduplicateCompanies(
  lists: readonly (readonly string[])[]
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const list of lists) {
    for (const company of list) {
      const key = company.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(company);
      }
    }
  }

  return result;
}

export interface CompanyListResult {
  readonly source: string;
  readonly totalCompanies: number;
  readonly totalSlugs: number;
  readonly results: readonly ValidationResult[];
}

export async function discoverFromCompanyLists(
  validator: TokenValidator,
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<CompanyListResult> {
  // Load all lists
  const sp500 = loadCompanyList("sp500.json");
  const cloud100 = loadCompanyList("forbes-cloud100.json");
  const ycCompanies = loadCompanyList("yc-companies.json");

  console.log(
    `Loaded lists: S&P 500 (${sp500.length}), Cloud 100 (${cloud100.length}), YC (${ycCompanies.length})`
  );

  // Deduplicate across lists
  const allCompanies = deduplicateCompanies([sp500, cloud100, ycCompanies]);
  console.log(`Unique companies after dedup: ${allCompanies.length}`);

  // Generate slug candidates
  const slugsToTest: Array<{ slug: string; company: string }> = [];
  const seenSlugs = new Set<string>();

  for (const company of allCompanies) {
    const slugs = generateSlugs(company);
    for (const slug of slugs) {
      if (!seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        slugsToTest.push({ slug, company });
      }
    }
  }

  console.log(`Generated ${slugsToTest.length} unique slug candidates`);

  // Validate all candidates
  const results: ValidationResult[] = [];

  for (let i = 0; i < slugsToTest.length; i++) {
    const { slug, company } = slugsToTest[i];
    onProgress?.(i + 1, slugsToTest.length, `${company} -> ${slug}`);

    const result = await validator.validate(slug);
    results.push(result);

    // Log valid discoveries
    if (result.valid && result.board) {
      console.log(
        `  FOUND: ${slug} -> ${result.board.name} (${result.board.jobCount} jobs)`
      );
    }
  }

  return {
    source: "company-lists",
    totalCompanies: allCompanies.length,
    totalSlugs: slugsToTest.length,
    results,
  };
}
