import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRelatedJobs } from "../related-jobs";

vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

interface FakeJob {
  id: string;
  publicJobId: string;
  title: string;
  location: string | null;
  remote: boolean;
  department: string | null;
  company: { name: string; slug: string };
}

function fakeJob(id: string, overrides: Partial<FakeJob> = {}): FakeJob {
  return {
    id,
    publicJobId: `pl-${id}`,
    title: `Job ${id}`,
    location: "Remote",
    remote: true,
    department: "Engineering",
    company: { name: "Acme", slug: "acme" },
    ...overrides,
  };
}

const findMany = db.job.findMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findMany.mockReset();
});

describe("getRelatedJobs", () => {
  it("returns same-company + same-department results first", async () => {
    findMany
      .mockResolvedValueOnce([fakeJob("a"), fakeJob("b")]) // tier 1
      .mockResolvedValueOnce([fakeJob("c")]) // tier 2
      .mockResolvedValueOnce([fakeJob("d")]); // tier 3

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    expect(result.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("dedupes jobs that appear in multiple tiers", async () => {
    findMany
      .mockResolvedValueOnce([fakeJob("a")]) // tier 1
      .mockResolvedValueOnce([fakeJob("a"), fakeJob("b")]) // tier 2 (a is dup)
      .mockResolvedValueOnce([fakeJob("b"), fakeJob("c")]); // tier 3 (b is dup)

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("respects the limit by stopping early", async () => {
    findMany
      .mockResolvedValueOnce([fakeJob("a"), fakeJob("b"), fakeJob("c")])
      .mockResolvedValueOnce([fakeJob("d"), fakeJob("e")])
      .mockResolvedValueOnce([fakeJob("f")]);

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
      limit: 3,
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("uses default limit of 6 when not provided", async () => {
    findMany
      .mockResolvedValueOnce(
        ["a", "b", "c", "d"].map((id) => fakeJob(id)),
      )
      .mockResolvedValueOnce(["e", "f", "g", "h"].map((id) => fakeJob(id)))
      .mockResolvedValueOnce(["i", "j"].map((id) => fakeJob(id)));

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    expect(result).toHaveLength(6);
  });

  it("skips department-based tiers when department is null", async () => {
    findMany.mockResolvedValueOnce([fakeJob("a"), fakeJob("b")]);

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: null,
    });

    // Only tier 2 (same-company) should have run
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("excludes the current job and inactive jobs in every tier", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    for (const call of findMany.mock.calls) {
      const args = call[0] as { where: { isActive: boolean; NOT: { id: string } } };
      expect(args.where.isActive).toBe(true);
      expect(args.where.NOT).toEqual({ id: "current" });
    }
  });

  it("returns empty array when limit is 0", async () => {
    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
      limit: 0,
    });

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns empty array when no related jobs exist anywhere", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    expect(result).toEqual([]);
  });

  it("preserves tier ordering even when later tiers have more results", async () => {
    // Tier 1 returns 1; tier 2 returns 2; tier 3 returns 3. Order must be tier1 → tier2 → tier3.
    findMany
      .mockResolvedValueOnce([fakeJob("t1-a")])
      .mockResolvedValueOnce([fakeJob("t2-a"), fakeJob("t2-b")])
      .mockResolvedValueOnce([fakeJob("t3-a"), fakeJob("t3-b"), fakeJob("t3-c")]);

    const result = await getRelatedJobs({
      currentJobId: "current",
      companyId: "co1",
      department: "Engineering",
    });

    expect(result.map((r) => r.id)).toEqual([
      "t1-a",
      "t2-a",
      "t2-b",
      "t3-a",
      "t3-b",
      "t3-c",
    ]);
  });
});
