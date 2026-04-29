import type { AtsProvider } from "@prisma/client";
import type { AtsDiscoveryValidator } from "../../types";
import type { AshbyApiResponse } from "./types";

const ASHBY_BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";

/**
 * Validates Ashby board names against the public Posting API.
 * A board is valid if it exists and has at least MIN_JOB_COUNT listed jobs.
 */
export class AshbyDiscoveryValidator implements AtsDiscoveryValidator {
  readonly provider: AtsProvider = "ASHBY";
  private static readonly MIN_JOB_COUNT = 3;

  async validate(boardName: string): Promise<{
    valid: boolean;
    board?: { name: string; jobCount: number; token: string };
    error?: string;
  }> {
    const url = `${ASHBY_BASE_URL}/${boardName}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });

      clearTimeout(timeout);

      if (res.status === 404) {
        return { valid: false, error: "Board not found" };
      }

      if (!res.ok) {
        return { valid: false, error: `http_${res.status}` };
      }

      const data = (await res.json()) as AshbyApiResponse;
      const listedJobs = data.jobs.filter((j) => j.isListed);

      if (listedJobs.length < AshbyDiscoveryValidator.MIN_JOB_COUNT) {
        return {
          valid: false,
          error: `Too few jobs (${listedJobs.length} listed, need ${AshbyDiscoveryValidator.MIN_JOB_COUNT})`,
        };
      }

      return {
        valid: true,
        board: {
          name: boardName,
          jobCount: listedJobs.length,
          token: boardName,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      return { valid: false, error: `exception: ${message}` };
    }
  }
}
