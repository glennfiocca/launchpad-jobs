import type { AtsProvider } from "@prisma/client";
import type {
  AtsClient,
  NormalizedJob,
  NormalizedQuestion,
  BoardMeta,
} from "../../types";
import type { AshbyApiResponse } from "./types";
import { mapAshbyJobToNormalized } from "./mapper";

const ASHBY_BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";

/**
 * Ashby implementation of AtsClient.
 * Delegates to the Ashby Posting API and maps responses to normalized types.
 */
export class AshbyAtsClient implements AtsClient {
  readonly provider: AtsProvider = "ASHBY";
  private readonly boardName: string;

  constructor(boardName: string) {
    this.boardName = boardName;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(
        `Ashby API error ${res.status} for ${url}: ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  async getBoard(): Promise<BoardMeta> {
    // Ashby has no separate board metadata endpoint — derive from the jobs response
    return {
      name: this.boardName,
      website: `https://jobs.ashbyhq.com/${this.boardName}`,
      logoUrl: null,
    };
  }

  async getJobs(): Promise<readonly NormalizedJob[]> {
    const url = `${ASHBY_BASE_URL}/${this.boardName}?includeCompensation=true`;
    const response = await this.fetchJson<AshbyApiResponse>(url);

    return response.jobs
      .filter((job) => job.isListed)
      .map(mapAshbyJobToNormalized);
  }

  async getJobQuestions(
    _jobExternalId: string
  ): Promise<readonly NormalizedQuestion[]> {
    // Ashby public API does not expose a questions endpoint.
    // Questions are embedded in the apply page's window.__appData
    // and will be fetched via Playwright scraping in a future phase.
    return [];
  }
}
