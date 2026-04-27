import type { GreenhouseJob, GreenhouseJobsResponse, GreenhouseQuestion } from "@/types";

const GREENHOUSE_BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

export interface GreenhouseBoard {
  name: string;
  website: string | null;
  logo: string | null;
}

export class GreenhouseClient {
  private boardToken: string;

  constructor(boardToken: string) {
    this.boardToken = boardToken;
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${GREENHOUSE_BASE_URL}/${this.boardToken}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(
        `Greenhouse API error ${res.status} for ${url}: ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  async getBoard(): Promise<GreenhouseBoard> {
    return this.fetch<GreenhouseBoard>("");
  }

  async getJobs(): Promise<GreenhouseJobsResponse> {
    return this.fetch<GreenhouseJobsResponse>("/jobs?content=true");
  }

  async getJob(jobId: string): Promise<GreenhouseJob> {
    return this.fetch<GreenhouseJob>(`/jobs/${jobId}?questions=true`);
  }
}

// Factory: create clients for known board tokens
export function createGreenhouseClient(boardToken: string): GreenhouseClient {
  return new GreenhouseClient(boardToken);
}

// Parse remote flag from location string
export function isRemoteJob(location: string): boolean {
  return /remote/i.test(location);
}

// Extract department name from greenhouse departments array
export function extractDepartment(
  departments: GreenhouseJob["departments"]
): string | null {
  if (!departments || departments.length === 0) return null;
  return departments[0].name;
}
