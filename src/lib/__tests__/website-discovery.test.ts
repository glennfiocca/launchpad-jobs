import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverAshbyWebsite } from "../website-discovery/ashby";
import { discoverGreenhouseWebsite } from "../website-discovery/greenhouse";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("discoverAshbyWebsite", () => {
  it("extracts publicWebsite from inlined Next.js JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<html><script>{"publicWebsite":"https://www.astronomer.io/","name":"Astronomer"}</script></html>',
    } as Response);
    const result = await discoverAshbyWebsite("astronomer");
    expect(result).toBe("https://www.astronomer.io");
  });

  it("returns null when publicWebsite is absent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html><body>No structured data</body></html>",
    } as Response);
    const result = await discoverAshbyWebsite("noboard");
    expect(result).toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await discoverAshbyWebsite("astronomer")).toBeNull();
  });

  it("returns null on fetch error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await discoverAshbyWebsite("astronomer")).toBeNull();
  });

  it("strips trailing slash + query string", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '"publicWebsite":"https://supabase.com/?utm_source=ashby"',
    } as Response);
    expect(await discoverAshbyWebsite("supabase")).toBe("https://supabase.com");
  });
});

describe("discoverGreenhouseWebsite", () => {
  it("extracts <a class=logo href> match", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<a href="https://www.anthropic.com/jobs" class="logo">logo</a>',
    } as Response);
    expect(await discoverGreenhouseWebsite("anthropic")).toBe(
      "https://www.anthropic.com",
    );
  });

  it("falls back to canonical when class=logo absent", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<link rel="canonical" href="https://stripe.com/jobs/search">',
    } as Response);
    expect(await discoverGreenhouseWebsite("stripe")).toBe(
      "https://stripe.com",
    );
  });

  it("rejects canonical that loops back to greenhouse.io itself", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<link rel="canonical" href="http://job-boards.greenhouse.io/anthropic">',
    } as Response);
    expect(await discoverGreenhouseWebsite("anthropic")).toBeNull();
  });

  it("falls through to og:url when other patterns miss", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<meta property="og:url" content="https://www.cargurus.com/jobs">',
    } as Response);
    expect(await discoverGreenhouseWebsite("cargurus")).toBe(
      "https://www.cargurus.com",
    );
  });

  it("returns null when no usable signal exists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html><body>JS-only board</body></html>",
    } as Response);
    expect(await discoverGreenhouseWebsite("hashicorp")).toBeNull();
  });

  it("strips paths down to the apex hostname", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        '<a href="https://careers.airbnb.com/positions/" class="logo">logo</a>',
    } as Response);
    expect(await discoverGreenhouseWebsite("airbnb")).toBe(
      "https://careers.airbnb.com",
    );
  });
});
