import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findMany: vi.fn(),
    },
  },
}));

import sitemap from "../sitemap";
import { db } from "@/lib/db";

const findManyMock = db.job.findMany as unknown as ReturnType<typeof vi.fn>;

describe("sitemap", () => {
  beforeEach(() => {
    findManyMock.mockReset();
  });

  it("includes the expected static URLs", async () => {
    findManyMock.mockResolvedValueOnce([]);

    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // Each entry should end with the expected path (host can vary per env).
    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/jobs"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/auth/signin"))).toBe(true);
  });

  it("appends a sitemap entry for each active job using publicJobId", async () => {
    const job1Updated = new Date("2026-04-01T12:00:00Z");
    const job2Updated = new Date("2026-04-15T08:30:00Z");

    findManyMock.mockResolvedValueOnce([
      { publicJobId: "PL-abc123", updatedAt: job1Updated },
      { publicJobId: "PL-def456", updatedAt: job2Updated },
    ]);

    const entries = await sitemap();
    const job1 = entries.find((e) => e.url.endsWith("/jobs/PL-abc123"));
    const job2 = entries.find((e) => e.url.endsWith("/jobs/PL-def456"));

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(job1?.changeFrequency).toBe("weekly");
    expect(job1?.priority).toBe(0.7);
    expect(job1?.lastModified).toBeInstanceOf(Date);
    expect(job2?.lastModified).toBeInstanceOf(Date);
  });

  it("queries only active jobs, ordered by postedAt desc, capped at 5000", async () => {
    findManyMock.mockResolvedValueOnce([]);

    await sitemap();

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const args = findManyMock.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true });
    expect(args.orderBy).toEqual({ postedAt: "desc" });
    expect(args.take).toBe(5000);
    expect(args.select).toEqual({ publicJobId: true, updatedAt: true });
  });

  it("uses Date instances for lastModified on static entries", async () => {
    findManyMock.mockResolvedValueOnce([]);

    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });
});
