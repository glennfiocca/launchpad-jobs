import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VALIDITY_WINDOW_DAYS } from "@/config/seo";

// Mock all sync.ts deps so we can exercise the upsert paths without touching
// the database. The test asserts that validThrough is computed as
// approximately Date.now() + VALIDITY_WINDOW_DAYS days for both the create
// and update branches.

const jobUpdate = vi.fn();
const jobCreate = vi.fn();
const jobFindUnique = vi.fn();
const jobUpdateMany = vi.fn();
const jobFindMany = vi.fn();
const companyUpsert = vi.fn();
const applicationFindMany = vi.fn();

vi.mock("../../db", () => ({
  db: {
    job: {
      findUnique: (...args: unknown[]) => jobFindUnique(...args),
      update: (...args: unknown[]) => jobUpdate(...args),
      create: (...args: unknown[]) => jobCreate(...args),
      updateMany: (...args: unknown[]) => jobUpdateMany(...args),
      findMany: (...args: unknown[]) => jobFindMany(...args),
    },
    company: {
      upsert: (...args: unknown[]) => companyUpsert(...args),
    },
    application: {
      findMany: (...args: unknown[]) => applicationFindMany(...args),
      update: vi.fn(),
    },
    applicationStatusHistory: {
      create: vi.fn(),
    },
    // Track B.4: lookupLogoOverride hits the DB by default. The sync hot
    // path under test invokes it via resolveCompanyLogoSync — return null
    // so the resolver falls through to the TS-map fallback.
    companyLogoOverride: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock("../registry", () => ({
  getClient: vi.fn(),
}));

vi.mock("../../public-job-id", () => ({
  generateUniquePublicJobId: vi.fn(async () => "PL-test-1234"),
}));

vi.mock("../../notifications", () => ({
  createNotification: vi.fn(async () => undefined),
}));

vi.mock("../../logo-enrichment", () => ({
  enrichCompanyLogo: vi.fn(async () => null),
}));

import { getClient } from "../registry";
import { syncBoard } from "../sync";

const mockGetClient = getClient as unknown as ReturnType<typeof vi.fn>;

const fixedNow = new Date("2026-05-01T12:00:00.000Z").getTime();

const baseNormalizedJob = {
  externalId: "ext-1",
  title: "Senior Engineer",
  location: "Remote",
  department: "Engineering",
  employmentType: "full_time",
  remote: true,
  absoluteUrl: "https://example.com/jobs/1",
  content: "<p>job description</p>",
  postedAt: new Date("2026-04-01T00:00:00.000Z"),
  compensation: undefined,
};

function makeClientStub() {
  return {
    getBoard: vi.fn(async () => ({
      name: "Acme Corp",
      website: "https://acme.test",
      logoUrl: null,
    })),
    getJobs: vi.fn(async () => [baseNormalizedJob]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
  mockGetClient.mockReturnValue(makeClientStub());
  companyUpsert.mockResolvedValue({
    id: "company-1",
    name: "Acme Corp",
    slug: "acme",
    website: "https://acme.test",
    logoUrl: "https://acme.test/logo.png",
  });
  jobUpdateMany.mockResolvedValue({ count: 0 });
  jobFindMany.mockResolvedValue([]);
  applicationFindMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncBoard validThrough handling", () => {
  it("sets validThrough on create when no existing Job row matches", async () => {
    jobFindUnique.mockResolvedValue(null);
    jobCreate.mockResolvedValue({ id: "job-new" });

    const result = await syncBoard("GREENHOUSE", "acme");

    expect(result.jobsAdded).toBe(1);
    expect(jobCreate).toHaveBeenCalledTimes(1);

    const createArg = jobCreate.mock.calls[0][0] as {
      data: { validThrough: Date };
    };
    const validThrough = createArg.data.validThrough;
    expect(validThrough).toBeInstanceOf(Date);

    const expected = fixedNow + VALIDITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(validThrough.getTime()).toBe(expected);
  });

  it("refreshes validThrough on update when an existing Job row matches", async () => {
    jobFindUnique.mockResolvedValue({
      id: "job-existing",
      publicJobId: "PL-existing-9999",
    });
    jobUpdate.mockResolvedValue({ id: "job-existing" });

    const result = await syncBoard("GREENHOUSE", "acme");

    expect(result.jobsUpdated).toBe(1);
    expect(jobUpdate).toHaveBeenCalledTimes(1);

    const updateArg = jobUpdate.mock.calls[0][0] as {
      data: { validThrough: Date };
    };
    const validThrough = updateArg.data.validThrough;
    expect(validThrough).toBeInstanceOf(Date);

    const expected = fixedNow + VALIDITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    expect(validThrough.getTime()).toBe(expected);
  });

  it("uses VALIDITY_WINDOW_DAYS from src/config/seo (not a magic number)", () => {
    // Regression guard: if anyone hardcodes 30 in sync.ts the centralized
    // constant must still be respected. This asserts the constant exists
    // and is the documented value.
    expect(VALIDITY_WINDOW_DAYS).toBe(30);
  });
});
