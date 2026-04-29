/**
 * Validates candidate board tokens against ATS provider APIs.
 * Supports Greenhouse and Ashby; dispatches to the registered AtsDiscoveryValidator.
 */

import type { AtsProvider } from "@prisma/client";
import { RateLimiter } from "./rate-limiter";
import { getDiscoveryValidator } from "../../src/lib/ats/registry";
import { registerGreenhouseProvider } from "../../src/lib/ats/providers/greenhouse";
import { registerAshbyProvider } from "../../src/lib/ats/providers/ashby";

// Ensure providers are registered when this module loads
let providersRegistered = false;
function ensureProviders(): void {
  if (!providersRegistered) {
    try { registerGreenhouseProvider(); } catch { /* already registered */ }
    try { registerAshbyProvider(); } catch { /* already registered */ }
    providersRegistered = true;
  }
}

export interface ValidatedBoard {
  readonly token: string;
  readonly name: string;
  readonly jobCount: number;
  readonly website: string | null;
  readonly provider: AtsProvider;
}

export interface ValidationResult {
  readonly token: string;
  readonly provider: AtsProvider;
  readonly valid: boolean;
  readonly board: ValidatedBoard | null;
  readonly error: string | null;
}

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

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
  private readonly provider: AtsProvider;

  constructor(
    existingTokens: ReadonlySet<string>,
    rateLimiter?: RateLimiter,
    provider: AtsProvider = "GREENHOUSE"
  ) {
    this.existingTokens = existingTokens;
    this.rateLimiter = rateLimiter ?? new RateLimiter();
    this.provider = provider;
  }

  /** Build a dedup key from provider + token */
  private dedupKey(token: string): string {
    return `${this.provider}:${token.toLowerCase()}`;
  }

  isAlreadyKnown(token: string): boolean {
    // Check both provider-prefixed key and bare token for backward compat
    return (
      this.existingTokens.has(this.dedupKey(token)) ||
      this.existingTokens.has(token.toLowerCase())
    );
  }

  async validate(token: string): Promise<ValidationResult> {
    const normalizedToken = token.toLowerCase().trim();

    if (this.isAlreadyKnown(normalizedToken)) {
      return {
        token: normalizedToken,
        provider: this.provider,
        valid: false,
        board: null,
        error: "already_known",
      };
    }

    // Dispatch to registry-based validator for non-Greenhouse or if preferred
    if (this.provider === "ASHBY") {
      return this.validateViaRegistry(normalizedToken);
    }

    // Greenhouse: use rate-limited fetch (original logic)
    try {
      const boardUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}`;
      const boardRes = await this.rateLimiter.fetch(boardUrl);

      if (boardRes.status === 404) {
        return {
          token: normalizedToken,
          provider: this.provider,
          valid: false,
          board: null,
          error: "not_found",
        };
      }

      if (!boardRes.ok) {
        return {
          token: normalizedToken,
          provider: this.provider,
          valid: false,
          board: null,
          error: `http_${boardRes.status}`,
        };
      }

      const boardData = (await boardRes.json()) as BoardResponse;

      const jobsUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}/jobs`;
      const jobsRes = await this.rateLimiter.fetch(jobsUrl);

      if (!jobsRes.ok) {
        return {
          token: normalizedToken,
          provider: this.provider,
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
          provider: this.provider,
          valid: false,
          board: null,
          error: "no_active_jobs",
        };
      }

      return {
        token: normalizedToken,
        provider: this.provider,
        valid: true,
        board: {
          token: normalizedToken,
          name: boardData.name,
          jobCount,
          website: null,
          provider: this.provider,
        },
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        token: normalizedToken,
        provider: this.provider,
        valid: false,
        board: null,
        error: `exception: ${message}`,
      };
    }
  }

  /**
   * Validates via the registered AtsDiscoveryValidator from the provider registry.
   */
  private async validateViaRegistry(
    normalizedToken: string
  ): Promise<ValidationResult> {
    try {
      ensureProviders();
      const registryValidator = getDiscoveryValidator(this.provider);
      const result = await registryValidator.validate(normalizedToken);

      if (!result.valid) {
        return {
          token: normalizedToken,
          provider: this.provider,
          valid: false,
          board: null,
          error: result.error ?? "not_found",
        };
      }

      return {
        token: normalizedToken,
        provider: this.provider,
        valid: true,
        board: result.board
          ? {
              token: result.board.token,
              name: result.board.name,
              jobCount: result.board.jobCount,
              website: null,
              provider: this.provider,
            }
          : null,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        token: normalizedToken,
        provider: this.provider,
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
