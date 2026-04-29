import type { AtsProvider } from "@prisma/client";
import type { AtsClient, NormalizedJob, NormalizedQuestion, BoardMeta } from "../../types";
import type { GreenhouseBoard, GreenhouseJob, GreenhouseJobsResponse } from "./types";
import {
  mapGreenhouseJobToNormalized,
  mapGreenhouseQuestionToNormalized,
} from "./mapper";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

/**
 * Greenhouse implementation of AtsClient.
 * Delegates to the Greenhouse Board API and maps responses to normalized types.
 */
export class GreenhouseAtsClient implements AtsClient {
  readonly provider: AtsProvider = "GREENHOUSE";
  private readonly boardToken: string;

  constructor(boardToken: string) {
    this.boardToken = boardToken;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${GREENHOUSE_BASE_URL}/${this.boardToken}${path}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(
        `Greenhouse API error ${res.status} for ${url}: ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  async getBoard(): Promise<BoardMeta> {
    const board = await this.fetchJson<GreenhouseBoard>("");
    return {
      name: board.name,
      website: board.website ?? null,
      logoUrl: board.logo ?? null,
    };
  }

  async getJobs(): Promise<readonly NormalizedJob[]> {
    const response = await this.fetchJson<GreenhouseJobsResponse>(
      "/jobs?content=true"
    );
    return response.jobs.map((ghJob) =>
      mapGreenhouseJobToNormalized(ghJob, this.boardToken)
    );
  }

  async getJobQuestions(
    jobExternalId: string
  ): Promise<readonly NormalizedQuestion[]> {
    const ghJob = await this.fetchJson<GreenhouseJob>(
      `/jobs/${jobExternalId}?questions=true`
    );
    const questions = ghJob.questions ?? [];
    return questions.flatMap(mapGreenhouseQuestionToNormalized);
  }
}
