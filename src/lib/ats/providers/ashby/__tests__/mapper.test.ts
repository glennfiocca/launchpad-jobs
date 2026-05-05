import { describe, it, expect } from "vitest";
import { mapAshbyJobToNormalized } from "../mapper";
import type { AshbyApiJob } from "../types";

// --- Helpers ---

function makeAshbyJob(overrides: Partial<AshbyApiJob> = {}): AshbyApiJob {
  return {
    id: "145ff46b-1441-4773-bcd3-c8c90baa598a",
    title: "Senior Software Engineer",
    department: "Engineering",
    team: "Platform",
    employmentType: "FullTime",
    location: "San Francisco, CA",
    isRemote: false,
    isListed: true,
    workplaceType: "OnSite",
    descriptionHtml: "<p>We are looking for a senior engineer...</p>",
    descriptionPlain: "We are looking for a senior engineer...",
    publishedAt: "2025-11-14T00:46:58.989+00:00",
    jobUrl: "https://jobs.ashbyhq.com/testco/145ff46b",
    applyUrl: "https://jobs.ashbyhq.com/testco/145ff46b/application",
    address: {
      postalAddress: {
        addressLocality: "San Francisco",
        addressRegion: "CA",
        addressCountry: "United States",
      },
    },
    secondaryLocations: [],
    ...overrides,
  };
}

// --- Tests ---

describe("mapAshbyJobToNormalized", () => {
  it("maps a full Ashby job to normalized shape", () => {
    const job = makeAshbyJob();
    const result = mapAshbyJobToNormalized(job);

    expect(result).toEqual({
      externalId: "145ff46b-1441-4773-bcd3-c8c90baa598a",
      title: "Senior Software Engineer",
      location: "San Francisco, CA",
      department: "Engineering",
      employmentType: "Full-time",
      remote: false,
      absoluteUrl: "https://jobs.ashbyhq.com/testco/145ff46b",
      applyUrl: "https://jobs.ashbyhq.com/testco/145ff46b/application",
      content: "<p>We are looking for a senior engineer...</p>",
      postedAt: new Date("2025-11-14T00:46:58.989+00:00"),
      compensation: undefined,
      countryCode: "US",
      locationCategory: "US_BASED",
      isUSEligible: true,
    });
  });

  it("maps with minimal data (missing optional fields)", () => {
    const job = makeAshbyJob({
      department: "",
      team: "",
      employmentType: "",
      location: "",
      descriptionHtml: "",
      publishedAt: "",
      jobUrl: "",
      applyUrl: "",
    });
    const result = mapAshbyJobToNormalized(job);

    expect(result.department).toBeNull();
    expect(result.employmentType).toBeNull();
    expect(result.location).toBeNull();
    expect(result.content).toBeNull();
    expect(result.absoluteUrl).toBeNull();
    expect(result.applyUrl).toBeNull();
    expect(result.postedAt).toBeNull();
  });

  describe("employment type normalization", () => {
    it.each([
      ["FullTime", "Full-time"],
      ["PartTime", "Part-time"],
      ["Intern", "Internship"],
      ["Contract", "Contract"],
      ["Temporary", "Temporary"],
    ])("maps %s to %s", (input, expected) => {
      const job = makeAshbyJob({ employmentType: input });
      const result = mapAshbyJobToNormalized(job);
      expect(result.employmentType).toBe(expected);
    });

    it("passes through unknown employment types unchanged", () => {
      const job = makeAshbyJob({ employmentType: "Freelance" });
      const result = mapAshbyJobToNormalized(job);
      expect(result.employmentType).toBe("Freelance");
    });
  });

  describe("compensation extraction", () => {
    it("extracts compensation from Salary component", () => {
      const job = makeAshbyJob({
        compensation: {
          compensationTierSummary: "$120k - $160k",
          scrapeableCompensationSalarySummary: "$120,000 - $160,000",
          compensationTiers: [
            {
              title: "Tier 1",
              components: [
                {
                  compensationType: "Salary",
                  currencyCode: "USD",
                  minValue: 120000,
                  maxValue: 160000,
                },
              ],
            },
          ],
        },
      });
      const result = mapAshbyJobToNormalized(job);

      expect(result.compensation).toEqual({
        min: 120000,
        max: 160000,
        currency: "USD",
      });
    });

    it("returns undefined compensation when no compensation field exists", () => {
      const job = makeAshbyJob();
      const result = mapAshbyJobToNormalized(job);
      expect(result.compensation).toBeUndefined();
    });

    it("returns undefined compensation when tiers are empty", () => {
      const job = makeAshbyJob({
        compensation: {
          compensationTierSummary: "",
          scrapeableCompensationSalarySummary: "",
          compensationTiers: [],
        },
      });
      const result = mapAshbyJobToNormalized(job);
      expect(result.compensation).toBeUndefined();
    });

    it("returns undefined when no Salary component exists", () => {
      const job = makeAshbyJob({
        compensation: {
          compensationTierSummary: "equity only",
          scrapeableCompensationSalarySummary: "",
          compensationTiers: [
            {
              title: "Tier 1",
              components: [
                {
                  compensationType: "Equity",
                  currencyCode: "USD",
                  minValue: 50000,
                  maxValue: 100000,
                },
              ],
            },
          ],
        },
      });
      const result = mapAshbyJobToNormalized(job);
      expect(result.compensation).toBeUndefined();
    });
  });

  describe("remote flag", () => {
    it("sets remote to true when isRemote is true", () => {
      const job = makeAshbyJob({ isRemote: true });
      expect(mapAshbyJobToNormalized(job).remote).toBe(true);
    });

    it("sets remote to false when isRemote is false", () => {
      const job = makeAshbyJob({ isRemote: false });
      expect(mapAshbyJobToNormalized(job).remote).toBe(false);
    });
  });

  it("falls back to team when department is empty", () => {
    const job = makeAshbyJob({ department: "", team: "Infrastructure" });
    const result = mapAshbyJobToNormalized(job);
    expect(result.department).toBe("Infrastructure");
  });
});
