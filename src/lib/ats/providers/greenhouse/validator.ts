import type { AtsProvider } from "@prisma/client";
import type { AtsDiscoveryValidator } from "../../types";

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

/**
 * Validates Greenhouse board tokens against the public Boards API.
 * A board is valid if it exists and has at least MIN_JOB_COUNT active jobs.
 */
export class GreenhouseDiscoveryValidator implements AtsDiscoveryValidator {
  readonly provider: AtsProvider = "GREENHOUSE";
  private static readonly MIN_JOB_COUNT = 3;

  async validate(token: string): Promise<{
    valid: boolean;
    board?: { name: string; jobCount: number; token: string };
    error?: string;
  }> {
    const normalizedToken = token.toLowerCase().trim();

    try {
      // Check if board exists
      const boardUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const boardRes = await fetch(boardUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (boardRes.status === 404) {
        return { valid: false, error: "Board not found" };
      }

      if (!boardRes.ok) {
        return { valid: false, error: `http_${boardRes.status}` };
      }

      const boardData = (await boardRes.json()) as BoardResponse;

      // Check job count
      const jobsUrl = `${GREENHOUSE_BASE_URL}/${normalizedToken}/jobs`;
      const jobsController = new AbortController();
      const jobsTimeout = setTimeout(() => jobsController.abort(), 10_000);

      const jobsRes = await fetch(jobsUrl, {
        signal: jobsController.signal,
      });
      clearTimeout(jobsTimeout);

      if (!jobsRes.ok) {
        return { valid: false, error: `jobs_http_${jobsRes.status}` };
      }

      const jobsData = (await jobsRes.json()) as JobsResponse;
      const jobCount = jobsData.jobs?.length ?? 0;

      if (jobCount < GreenhouseDiscoveryValidator.MIN_JOB_COUNT) {
        return {
          valid: false,
          error: jobCount === 0
            ? "no_active_jobs"
            : `Too few jobs (${jobCount}, need ${GreenhouseDiscoveryValidator.MIN_JOB_COUNT})`,
        };
      }

      return {
        valid: true,
        board: {
          name: boardData.name,
          jobCount,
          token: normalizedToken,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return { valid: false, error: `exception: ${message}` };
    }
  }
}
