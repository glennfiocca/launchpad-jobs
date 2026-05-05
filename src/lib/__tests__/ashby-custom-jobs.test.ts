import { describe, it, expect, vi, afterEach } from "vitest";
import { discoverAshbyCustomJobMap, buildAshbyJidFallback } from "../ashby-custom-jobs";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("discoverAshbyCustomJobMap", () => {
  it("returns null when Ashby returns no org info", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { organizationFromHostedJobsPageName: null } }),
    } as Response);
    expect(await discoverAshbyCustomJobMap("missing-board")).toBeNull();
  });

  it("returns null when customJobsPageUrl is null (board works fine)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          organizationFromHostedJobsPageName: {
            name: "Astronomer",
            publicWebsite: "https://www.astronomer.io",
            customJobsPageUrl: null,
            hostedJobsPageSlug: "astronomer",
          },
        },
      }),
    } as Response);
    expect(await discoverAshbyCustomJobMap("astronomer")).toBeNull();
  });

  it("builds a uuid → custom-url map for self-hosted boards", async () => {
    const fetchMock = vi.fn();

    // 1st call: GraphQL — returns customJobsPageUrl
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          organizationFromHostedJobsPageName: {
            name: "Cursor",
            publicWebsite: "https://www.cursor.com",
            customJobsPageUrl: "https://cursor.com/careers",
            hostedJobsPageSlug: "cursor",
          },
        },
      }),
    } as Response);

    // 2nd call: careers index — returns two slug links
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        '<a href="/careers/software-engineer">SE</a><a href="/careers/designer">D</a>',
    } as Response);

    // 3rd + 4th calls: per-job pages with embedded UUIDs
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        'apply at https://jobs.ashbyhq.com/cursor/0ec39ed7-a5dc-4551-bb26-b7f4f9fb4a74/application',
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        'apply at https://jobs.ashbyhq.com/cursor/aaaa1111-bbbb-2222-cccc-333333333333/application',
    } as Response);

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await discoverAshbyCustomJobMap("cursor", { concurrency: 1 });
    expect(result).not.toBeNull();
    expect(result?.byUuid.size).toBe(2);
    expect(result?.byUuid.get("0ec39ed7-a5dc-4551-bb26-b7f4f9fb4a74")).toBe(
      "https://cursor.com/careers/software-engineer",
    );
    expect(result?.byUuid.get("aaaa1111-bbbb-2222-cccc-333333333333")).toBe(
      "https://cursor.com/careers/designer",
    );
  });

  it("buildFallbackUrl returns a clean ?ashby_jid= URL for self-hosters", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          organizationFromHostedJobsPageName: {
            name: "FullStory",
            publicWebsite: "https://www.fullstory.com",
            customJobsPageUrl: "https://www.fullstory.com/careers?ashby_jid=stale-id&utm_source=x",
            hostedJobsPageSlug: "fullstory",
          },
        },
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "<html>no slug links</html>" } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await discoverAshbyCustomJobMap("fullstory");
    expect(result).not.toBeNull();
    const url = result?.buildFallbackUrl("baf1fc23-ffe2-43bb-b53d-fb7070740010");
    expect(url).toBe(
      "https://www.fullstory.com/careers?ashby_jid=baf1fc23-ffe2-43bb-b53d-fb7070740010",
    );
  });

  it("buildFallbackUrl refuses self-hosters whose customJobsPageUrl loops back to ashbyhq.com", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          organizationFromHostedJobsPageName: {
            name: "Rev",
            publicWebsite: null,
            customJobsPageUrl: "https://jobs.ashbyhq.com/Rev",
            hostedJobsPageSlug: "rev",
          },
        },
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "" } as Response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await discoverAshbyCustomJobMap("rev");
    expect(result?.buildFallbackUrl("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("buildAshbyJidFallback strips stale ashby_jid + utm tracking", () => {
    const url = buildAshbyJidFallback(
      "https://www.fullstory.com/careers?ashby_jid=stale&utm_source=x&utm_medium=y",
      "baf1fc23-ffe2-43bb-b53d-fb7070740010",
    );
    expect(url).toBe(
      "https://www.fullstory.com/careers?ashby_jid=baf1fc23-ffe2-43bb-b53d-fb7070740010",
    );
  });

  it("buildAshbyJidFallback returns null for ashbyhq.com domains", () => {
    expect(
      buildAshbyJidFallback("https://jobs.ashbyhq.com/Rev", "00000000-0000-0000-0000-000000000000"),
    ).toBeNull();
  });

  it("returns an empty map when the careers index has no slugs", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          organizationFromHostedJobsPageName: {
            name: "X",
            publicWebsite: null,
            customJobsPageUrl: "https://example.com/careers",
            hostedJobsPageSlug: "x",
          },
        },
      }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html>no /careers/* links</html>",
    } as Response);

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const result = await discoverAshbyCustomJobMap("x");
    expect(result).not.toBeNull();
    expect(result?.byUuid.size).toBe(0);
  });
});
