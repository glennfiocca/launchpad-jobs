import { describe, it, expect, vi, beforeEach } from "vitest";
import { AshbyAtsClient } from "../client";
import boardFixture from "./fixtures/ashby-board-response.json";

// --- Mock fetch ---

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

// --- Tests ---

describe("AshbyAtsClient", () => {
  let client: AshbyAtsClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new AshbyAtsClient("testco");
  });

  describe("getBoard", () => {
    it("returns board metadata derived from boardName", async () => {
      const board = await client.getBoard();

      expect(board).toEqual({
        name: "testco",
        website: "https://jobs.ashbyhq.com/testco",
        logoUrl: null,
      });
    });
  });

  describe("getJobs", () => {
    it("returns only listed jobs, normalized", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(boardFixture));

      const jobs = await client.getJobs();

      // Fixture has 4 jobs total, 3 listed (1 unlisted)
      expect(jobs).toHaveLength(3);
      expect(jobs.map((j) => j.title)).toEqual([
        "Senior Software Engineer",
        "Product Manager",
        "Design Intern",
      ]);
    });

    it("filters out unlisted jobs", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(boardFixture));

      const jobs = await client.getJobs();
      const titles = jobs.map((j) => j.title);

      expect(titles).not.toContain("Internal Role");
    });

    it("normalizes employment types in returned jobs", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(boardFixture));

      const jobs = await client.getJobs();
      const types = jobs.map((j) => j.employmentType);

      expect(types).toContain("Full-time");
      expect(types).toContain("Part-time");
      expect(types).toContain("Internship");
    });

    it("includes compensation data when present", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(boardFixture));

      const jobs = await client.getJobs();
      const pm = jobs.find((j) => j.title === "Product Manager");

      expect(pm?.compensation).toEqual({
        min: 120000,
        max: 160000,
        currency: "USD",
      });
    });

    it("calls the correct Ashby API URL", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(boardFixture));

      await client.getJobs();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.ashbyhq.com/posting-api/job-board/testco?includeCompensation=true",
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        })
      );
    });
  });

  describe("getJobQuestions", () => {
    it("returns an empty array (Ashby limitation)", async () => {
      const questions = await client.getJobQuestions("any-job-id");
      expect(questions).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: "Not Found" }, 404)
      );

      await expect(client.getJobs()).rejects.toThrow(
        /Ashby API error 404/
      );
    });

    it("includes URL in error message", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({ error: "Server Error" }, 500)
      );

      await expect(client.getJobs()).rejects.toThrow(/testco/);
    });

    it("throws on network failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network unreachable"));

      await expect(client.getJobs()).rejects.toThrow("Network unreachable");
    });
  });
});
