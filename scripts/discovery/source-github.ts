/**
 * Source B: Discover board tokens from GitHub code search.
 * Searches for files containing Greenhouse and Ashby API URLs and extracts board tokens.
 */

import { execSync } from "node:child_process";
import type { AtsProvider } from "@prisma/client";
import type { TokenValidator, ValidationResult } from "./validate-token";

const GREENHOUSE_TOKEN_REGEX =
  /boards[-.](?:api\.)?greenhouse\.io(?:\/v1\/boards)?\/([a-z0-9][a-z0-9-]{1,50})/gi;

const ASHBY_TOKEN_REGEX =
  /(?:jobs\.ashbyhq\.com|api\.ashbyhq\.com\/posting-api\/job-board)\/([a-z0-9][a-z0-9-]{1,50})/gi;

// Common false positives to skip
const SKIP_TOKENS = new Set([
  "api",
  "v1",
  "boards",
  "jobs",
  "embed",
  "job_board",
  "undefined",
  "null",
  "example",
  "test",
  "demo",
  "your-company",
  "yourcompany",
  "company",
  "boardtoken",
  "board_token",
  "posting-api",
  "job-board",
]);

interface ExtractedCandidate {
  readonly token: string;
  readonly provider: AtsProvider;
}

function extractTokensFromText(text: string): readonly ExtractedCandidate[] {
  const seen = new Set<string>();
  const candidates: ExtractedCandidate[] = [];

  // Greenhouse tokens
  GREENHOUSE_TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GREENHOUSE_TOKEN_REGEX.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    const key = `GREENHOUSE:${token}`;
    if (!SKIP_TOKENS.has(token) && token.length >= 2 && !seen.has(key)) {
      seen.add(key);
      candidates.push({ token, provider: "GREENHOUSE" });
    }
  }

  // Ashby tokens
  ASHBY_TOKEN_REGEX.lastIndex = 0;
  while ((match = ASHBY_TOKEN_REGEX.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    const key = `ASHBY:${token}`;
    if (!SKIP_TOKENS.has(token) && token.length >= 2 && !seen.has(key)) {
      seen.add(key);
      candidates.push({ token, provider: "ASHBY" });
    }
  }

  return candidates;
}

function searchGitHub(query: string): string {
  try {
    // Use text-match media type to get text_matches with fragments
    const result = execSync(
      `gh api search/code -X GET -H "Accept: application/vnd.github.text-match+json" -f q='${query}' -f per_page=100 --jq '[.items[].text_matches[]?.fragment // empty] | join("\\n")'`,
      { encoding: "utf-8", timeout: 30000 }
    );
    return result;
  } catch {
    // Fallback: extract tokens from file paths/repo names instead
    try {
      const result = execSync(
        `gh api search/code -X GET -f q='${query}' -f per_page=100 --jq '.items[] | .repository.full_name + " " + .path + " " + (.repository.html_url // "")'`,
        { encoding: "utf-8", timeout: 30000 }
      );
      return result;
    } catch {
      console.warn(`GitHub search failed for query: ${query}`);
      return "";
    }
  }
}

/**
 * Fetch raw file content from a GitHub repo to extract tokens.
 */
function fetchGitHubFileContent(repo: string, filePath: string): string {
  try {
    const result = execSync(
      `gh api repos/${repo}/contents/${filePath} --jq '.content' 2>/dev/null | base64 -d 2>/dev/null`,
      { encoding: "utf-8", timeout: 15000 }
    );
    return result;
  } catch {
    return "";
  }
}

/**
 * Search GitHub for files and fetch their raw content to extract tokens.
 */
function searchAndFetchContent(query: string): string {
  try {
    const result = execSync(
      `gh api search/code -X GET -f q='${query}' -f per_page=20 --jq '.items[] | .repository.full_name + "|||" + .path'`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const lines = result.trim().split("\n").filter(Boolean);
    const contents: string[] = [];

    for (const line of lines.slice(0, 10)) {
      const [repo, filePath] = line.split("|||");
      if (repo && filePath) {
        const content = fetchGitHubFileContent(repo, filePath);
        if (content) {
          contents.push(content);
        }
      }
    }

    return contents.join("\n");
  } catch {
    console.warn(`GitHub content search failed for query: ${query}`);
    return "";
  }
}

export interface GitHubResult {
  readonly source: string;
  readonly tokensFound: number;
  readonly results: readonly ValidationResult[];
}

export async function discoverFromGitHub(
  validator: TokenValidator,
  onProgress?: (completed: number, total: number, current: string) => void,
  ashbyValidator?: TokenValidator
): Promise<GitHubResult> {
  console.log("Searching GitHub for board tokens (Greenhouse + Ashby)...");

  const allCandidates = new Map<string, ExtractedCandidate>();

  function addCandidates(candidates: readonly ExtractedCandidate[]): void {
    for (const c of candidates) {
      const key = `${c.provider}:${c.token}`;
      if (!allCandidates.has(key)) {
        allCandidates.set(key, c);
      }
    }
  }

  // Greenhouse search queries
  const greenhouseQueries = [
    '"boards-api.greenhouse.io" language:TypeScript',
    '"boards-api.greenhouse.io" language:JavaScript',
    '"boards-api.greenhouse.io" language:Python',
    '"boards.greenhouse.io" language:TypeScript',
    '"boards.greenhouse.io" language:JavaScript',
    '"boards.greenhouse.io" language:JSON',
  ];

  // Ashby search queries
  const ashbyQueries = [
    '"jobs.ashbyhq.com" language:TypeScript',
    '"jobs.ashbyhq.com" language:JavaScript',
    '"api.ashbyhq.com/posting-api" language:TypeScript',
    '"api.ashbyhq.com/posting-api" language:JavaScript',
    '"jobs.ashbyhq.com" language:JSON',
  ];

  const allQueries = [...greenhouseQueries, ...ashbyQueries];

  for (const query of allQueries) {
    console.log(`  Searching: ${query}`);
    const text = searchGitHub(query);
    const candidates = extractTokensFromText(text);
    console.log(`    Found ${candidates.length} tokens from text matches`);
    addCandidates(candidates);
    // Brief pause between GitHub API calls
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Deep search: fetch actual file contents for richer token extraction
  const deepQueries = [
    '"boards-api.greenhouse.io" filename:config',
    '"boards-api.greenhouse.io" filename:companies',
    '"greenhouse" "boardToken" language:JSON',
    '"greenhouse" "board_token" language:Python',
    '"boards.greenhouse.io" filename:seed',
    '"jobs.ashbyhq.com" filename:config',
    '"ashbyhq" "boardName" language:JSON',
  ];

  for (const query of deepQueries) {
    console.log(`  Deep search: ${query}`);
    const content = searchAndFetchContent(query);
    const candidates = extractTokensFromText(content);
    console.log(`    Found ${candidates.length} tokens from file contents`);
    addCandidates(candidates);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Also try to fetch known repos with board lists
  const knownRepos = [
    "adgramigna/job-board-scraper",
  ];

  for (const repo of knownRepos) {
    try {
      console.log(`  Checking repo: ${repo}`);
      const result = execSync(
        `gh api repos/${repo}/contents --jq '.[].name' 2>/dev/null || echo ""`,
        { encoding: "utf-8", timeout: 15000 }
      );

      const configFiles = result
        .split("\n")
        .filter((f) =>
          f.match(/\.(json|ts|js|py|yaml|yml|csv)$/i)
        );

      for (const file of configFiles.slice(0, 5)) {
        try {
          const content = execSync(
            `gh api repos/${repo}/contents/${file} --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo ""`,
            { encoding: "utf-8", timeout: 15000 }
          );
          addCandidates(extractTokensFromText(content));
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      console.warn(`  Could not access repo: ${repo}`);
    }
  }

  const candidateList = [...allCandidates.values()];
  console.log(`Found ${candidateList.length} unique candidate tokens from GitHub`);

  // Validate all candidates, dispatching to the appropriate validator
  const results: ValidationResult[] = [];

  for (let i = 0; i < candidateList.length; i++) {
    const candidate = candidateList[i];
    const label = `[${candidate.provider}] ${candidate.token}`;
    onProgress?.(i + 1, candidateList.length, label);

    const activeValidator =
      candidate.provider === "ASHBY" && ashbyValidator
        ? ashbyValidator
        : validator;

    const result = await activeValidator.validate(candidate.token);
    results.push(result);

    if (result.valid && result.board) {
      console.log(
        `  FOUND: ${label} -> ${result.board.name} (${result.board.jobCount} jobs)`
      );
    }
  }

  return {
    source: "github",
    tokensFound: candidateList.length,
    results,
  };
}
