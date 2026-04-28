/**
 * Source B: Discover Greenhouse board tokens from GitHub code search.
 * Searches for files containing Greenhouse API URLs and extracts board tokens.
 */

import { execSync } from "node:child_process";
import type { TokenValidator, ValidationResult } from "./validate-token";

const TOKEN_REGEX =
  /boards[-.](?:api\.)?greenhouse\.io(?:\/v1\/boards)?\/([a-z0-9][a-z0-9-]{1,50})/gi;

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
]);

function extractTokensFromText(text: string): readonly string[] {
  const tokens = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const token = match[1].toLowerCase();
    if (!SKIP_TOKENS.has(token) && token.length >= 2) {
      tokens.add(token);
    }
  }

  return [...tokens];
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
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<GitHubResult> {
  console.log("Searching GitHub for Greenhouse board tokens...");

  const allTokens = new Set<string>();

  // Search queries
  const queries = [
    '"boards-api.greenhouse.io" language:TypeScript',
    '"boards-api.greenhouse.io" language:JavaScript',
    '"boards-api.greenhouse.io" language:Python',
    '"boards.greenhouse.io" language:TypeScript',
    '"boards.greenhouse.io" language:JavaScript',
    '"boards.greenhouse.io" language:JSON',
  ];

  for (const query of queries) {
    console.log(`  Searching: ${query}`);
    const text = searchGitHub(query);
    const tokens = extractTokensFromText(text);
    console.log(`    Found ${tokens.length} tokens from text matches`);
    for (const token of tokens) {
      allTokens.add(token);
    }
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
  ];

  for (const query of deepQueries) {
    console.log(`  Deep search: ${query}`);
    const content = searchAndFetchContent(query);
    const tokens = extractTokensFromText(content);
    console.log(`    Found ${tokens.length} tokens from file contents`);
    for (const token of tokens) {
      allTokens.add(token);
    }
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

      // Try to find config files that might list board tokens
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
          const tokens = extractTokensFromText(content);
          for (const token of tokens) {
            allTokens.add(token);
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      console.warn(`  Could not access repo: ${repo}`);
    }
  }

  const tokenList = [...allTokens];
  console.log(`Found ${tokenList.length} unique candidate tokens from GitHub`);

  // Validate all candidates
  const results: ValidationResult[] = [];

  for (let i = 0; i < tokenList.length; i++) {
    const token = tokenList[i];
    onProgress?.(i + 1, tokenList.length, token);
    const result = await validator.validate(token);
    results.push(result);

    if (result.valid && result.board) {
      console.log(
        `  FOUND: ${token} -> ${result.board.name} (${result.board.jobCount} jobs)`
      );
    }
  }

  return {
    source: "github",
    tokensFound: tokenList.length,
    results,
  };
}
