import { describe, it, expect, vi, beforeEach } from "vitest";
import { AshbyDiscoveryValidator } from "../validator";
import type { AshbyApiResponse } from "../types";

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

function makeBoardResponse(listedCount: number, unlistedCount = 0): AshbyApiResponse {
  const jobs = [];
  for (let i = 0; i < listedCount; i++) {
    jobs.push({
      id: `listed-${i}`,
      title: `Job ${i}`,
      department: "Eng",
      team: "Core",
      employmentType: "FullTime",
      location: "Remote",
      isRemote: true,
      isListed: true,
      workplaceType: "Remote",
      descriptionHtml: "<p>Listed</p>",
      descriptionPlain: "Listed",
      publishedAt: "2025-01-01T00:00:00.000Z",
      jobUrl: `https://jobs.ashbyhq.com/co/listed-${i}`,
      applyUrl: `https://jobs.ashbyhq.com/co/listed-${i}/application`,
      address: {
        postalAddress: {
          addressLocality: "",
          addressRegion: "",
          addressCountry: "",
        },
      },
      secondaryLocations: [],
    });
  }
  for (let i = 0; i < unlistedCount; i++) {
    jobs.push({
      id: `unlisted-${i}`,
      title: `Internal ${i}`,
      department: "HR",
      team: "People",
      employmentType: "FullTime",
      location: "Remote",
      isRemote: true,
      isListed: false,
      workplaceType: "Remote",
      descriptionHtml: "<p>Unlisted</p>",
      descriptionPlain: "Unlisted",
      publishedAt: "2025-01-01T00:00:00.000Z",
      jobUrl: `https://jobs.ashbyhq.com/co/unlisted-${i}`,
      applyUrl: `https://jobs.ashbyhq.com/co/unlisted-${i}/application`,
      address: {
        postalAddress: {
          addressLocality: "",
          addressRegion: "",
          addressCountry: "",
        },
      },
      secondaryLocations: [],
    });
  }

  return { apiVersion: "1", jobs };
}

// --- Tests ---

describe("AshbyDiscoveryValidator", () => {
  let validator: AshbyDiscoveryValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new AshbyDiscoveryValidator();
  });

  it("returns valid for a board with enough listed jobs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makeBoardResponse(5))
    );

    const result = await validator.validate("good-board");

    expect(result.valid).toBe(true);
    expect(result.board).toEqual({
      name: "good-board",
      jobCount: 5,
      token: "good-board",
    });
  });

  it("returns invalid for a 404 board", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ error: "Not Found" }, 404)
    );

    const result = await validator.validate("nonexistent");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Board not found");
  });

  it("returns invalid for non-404 HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ error: "Server Error" }, 500)
    );

    const result = await validator.validate("broken");

    expect(result.valid).toBe(false);
    expect(result.error).toBe("http_500");
  });

  it("returns invalid when board has too few listed jobs", async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makeBoardResponse(2, 10))
    );

    const result = await validator.validate("small-board");

    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Too few jobs.*2 listed.*need 3/);
  });

  it("counts only listed jobs (ignores unlisted)", async () => {
    // 2 listed + 10 unlisted = should fail (need 3 listed)
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse(makeBoardResponse(2, 10))
    );

    const result = await validator.validate("mostly-unlisted");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("2 listed");
  });

  it("returns invalid on network/fetch exception", async () => {
    mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"));

    const result = await validator.validate("unreachable");

    expect(result.valid).toBe(false);
    expect(result.error).toContain("DNS resolution failed");
  });

  it("has provider set to ASHBY", () => {
    expect(validator.provider).toBe("ASHBY");
  });
});
