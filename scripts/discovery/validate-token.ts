/**
 * Validates candidate Greenhouse board tokens against the public API.
 * Checks that the board exists and has active job listings.
 */

import { RateLimiter } from "./rate-limiter";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export interface ValidatedBoard {
  readonly token: string;
  readonly name: string;
  readonly jobCount: number;
  readonly website: string | null;
}

export interface ValidationResult {
  readonly token: string;
  readonly valid: boolean;
  readonly board: ValidatedBoard | null;
  readonly error: string | null;
}

interface BoardResponse {
  readonly name: string;
  readonly content: string;
  readonly departments: readonly unknown[];
}

interface JobsResponse {
  readonly jobs: readonly unknown[];
  readonly meta: { readonly total: number };
}

export class TokenValidator {
  private readonly rateLimiter: RateLimiter;
  private readonly existingTokens: ReadonlySet<string>;

  constructor(
    existingTokens: ReadonlySet<string>,
    rateLimiter?: RateLimiter
  ) {
    this.existingTokens = existingTokens;
    this.rateLimiter = rateLimiter ?? new RateLimiter();
  }

  isAlreadyKnown(token: string): boolean {
    return this.existingTokens.has(token.toLowerCase());
  }

  async validate(token: string): Promise<ValidationResult> {
    const normalizedToken = token.toLowerCase().trim();

    if (this.isAlreadyKnown(normalizedToken)) {
      return {
        token: normalizedToken,
        valid: false,
        board: null,
        error: "already_known",
      };
    }

    try {
      // Step 1: Check if board exists
      const boardUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}`;
      const boardRes = await this.rateLimiter.fetch(boardUrl);

      if (boardRes.status === 404) {
        return {
          token: normalizedToken,
          valid: false,
          board: null,
          error: "not_found",
        };
      }

      if (!boardRes.ok) {
        return {
          token: normalizedToken,
          valid: false,
          board: null,
          error: `http_${boardRes.status}`,
        };
      }

      const boardData = (await boardRes.json()) as BoardResponse;

      // Step 2: Check job count
      const jobsUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}/jobs`;
      const jobsRes = await this.rateLimiter.fetch(jobsUrl);

      if (!jobsRes.ok) {
        return {
          token: normalizedToken,
          valid: false,
          board: null,
          error: `jobs_http_${jobsRes.status}`,
        };
      }

      const jobsData = (await jobsRes.json()) as JobsResponse;
      const jobCount = jobsData.jobs?.length ?? 0;

      if (jobCount === 0) {
        return {
          token: normalizedToken,
          valid: false,
          board: null,
          error: "no_active_jobs",
        };
      }

      return {
        token: normalizedToken,
        valid: true,
        board: {
          token: normalizedToken,
          name: boardData.name,
          jobCount,
          website: null, // Board endpoint doesn't always return website
        },
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        token: normalizedToken,
        valid: false,
        board: null,
        error: `exception: ${message}`,
      };
    }
  }

  async validateBatch(
    tokens: readonly string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<readonly ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const result = await this.validate(tokens[i]);
      results.push(result);
      onProgress?.(i + 1, tokens.length);
    }

    return results;
  }
}
