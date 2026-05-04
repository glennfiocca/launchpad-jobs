import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import sitemap, { generateSitemaps } from "../sitemap";
import { db } from "@/lib/db";

const findManyMock = db.job.findMany as unknown as ReturnType<typeof vi.fn>;
const countMock = db.job.count as unknown as ReturnType<typeof vi.fn>;

const CHUNK_SIZE = 45_000;

describe("generateSitemaps", () => {
  beforeEach(() => {
    countMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns a single chunk when there are zero active jobs", async () => {
    countMock.mockResolvedValueOnce(0);
    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }]);
  });

  it("returns a single chunk for a small set of active jobs", async () => {
    countMock.mockResolvedValueOnce(1);
    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }]);
  });

  it("returns one chunk for 1000 jobs (well below the cap)", async () => {
    countMock.mockResolvedValueOnce(1000);
    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }]);
  });

  it("returns two chunks at 90,000 jobs (exactly 2 * CHUNK_SIZE)", async () => {
    countMock.mockResolvedValueOnce(90_000);
    const chunks = await generateSitemaps();
    expect(chunks).toHaveLength(2);
    expect(chunks).toEqual([{ id: 0 }, { id: 1 }]);
  });

  it("rounds up partial chunks: 45,001 jobs => 2 chunks", async () => {
    countMock.mockResolvedValueOnce(CHUNK_SIZE + 1);
    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }, { id: 1 }]);
  });

  it("falls back to a single chunk when the DB count fails", async () => {
    countMock.mockRejectedValueOnce(new Error("db down"));
    const chunks = await generateSitemaps();
    expect(chunks).toEqual([{ id: 0 }]);
  });
});

describe("sitemap (per-chunk)", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    countMock.mockReset();
  });

  it("chunk 0 includes the static URLs", async () => {
    findManyMock.mockResolvedValueOnce([]);

    const entries = await sitemap({ id: Promise.resolve("0") });
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/jobs"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/auth/signin"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/signup"))).toBe(true);
  });

  it("chunk 0 appends a sitemap entry for each active job using publicJobId", async () => {
    const job1Updated = new Date("2026-04-01T12:00:00Z");
    const job2Updated = new Date("2026-04-15T08:30:00Z");

    findManyMock.mockResolvedValueOnce([
      { publicJobId: "PL-abc123", updatedAt: job1Updated },
      { publicJobId: "PL-def456", updatedAt: job2Updated },
    ]);

    const entries = await sitemap({ id: Promise.resolve("0") });
    const job1 = entries.find((e) => e.url.endsWith("/jobs/PL-abc123"));
    const job2 = entries.find((e) => e.url.endsWith("/jobs/PL-def456"));

    expect(job1).toBeDefined();
    expect(job2).toBeDefined();
    expect(job1?.changeFrequency).toBe("weekly");
    expect(job1?.priority).toBe(0.7);
    expect(job1?.lastModified).toBe(job1Updated);
    expect(job2?.lastModified).toBe(job2Updated);
  });

  it("chunk 1 does NOT include static entries", async () => {
    findManyMock.mockResolvedValueOnce([
      { publicJobId: "PL-chunk1job", updatedAt: new Date("2026-04-20T00:00:00Z") },
    ]);

    const entries = await sitemap({ id: Promise.resolve("1") });
    const urls = entries.map((e) => e.url);

    expect(urls.some((u) => u.endsWith("/"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/jobs"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/auth/signin"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/signup"))).toBe(false);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/jobs\/PL-chunk1job$/);
  });

  it("queries only active jobs, ordered by id asc, with offset pagination per chunk", async () => {
    findManyMock.mockResolvedValue([]);

    await sitemap({ id: Promise.resolve("0") });
    const args0 = findManyMock.mock.calls[0][0];
    expect(args0.where).toEqual({ isActive: true });
    expect(args0.orderBy).toEqual({ id: "asc" });
    expect(args0.take).toBe(CHUNK_SIZE);
    expect(args0.skip).toBe(0);
    expect(args0.select).toEqual({ publicJobId: true, updatedAt: true });

    await sitemap({ id: Promise.resolve("2") });
    const args2 = findManyMock.mock.calls[1][0];
    expect(args2.skip).toBe(2 * CHUNK_SIZE);
    expect(args2.take).toBe(CHUNK_SIZE);
  });

  it("uses Date instances for lastModified on all entries", async () => {
    findManyMock.mockResolvedValueOnce([
      { publicJobId: "PL-abc", updatedAt: new Date("2026-03-01T00:00:00Z") },
    ]);

    const entries = await sitemap({ id: Promise.resolve("0") });
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it("on DB error, chunk 0 returns just the static entries", async () => {
    findManyMock.mockRejectedValueOnce(new Error("db down"));

    const entries = await sitemap({ id: Promise.resolve("0") });
    expect(entries.length).toBe(4); // 4 static entries
    expect(entries.every((e) => !e.url.includes("/jobs/PL-"))).toBe(true);
  });

  it("on DB error, chunk 1+ returns an empty array (no static entries)", async () => {
    findManyMock.mockRejectedValueOnce(new Error("db down"));

    const entries = await sitemap({ id: Promise.resolve("1") });
    expect(entries).toEqual([]);
  });
});
