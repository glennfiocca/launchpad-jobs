import { describe, it, expect } from "vitest";
import { shouldPreserveAbsoluteUrl } from "../sync";

describe("shouldPreserveAbsoluteUrl", () => {
  const SLUG_URL = "https://cursor.com/careers/software-engineer-growth";
  const FALLBACK_URL = "https://cursor.com/careers?ashby_jid=0ec39ed7-a5dc-4551-bb26-b7f4f9fb4a74";
  const BROKEN_ASHBY_URL = "https://jobs.ashbyhq.com/cursor/0ec39ed7-a5dc-4551-bb26-b7f4f9fb4a74";

  it("preserves a slug URL when sync wants to write the ?ashby_jid fallback", () => {
    // Cursor scenario: backfill wrote /careers/{slug}; sync's getJobs now
    // returns the ?ashby_jid fallback. The slug version is more specific.
    expect(shouldPreserveAbsoluteUrl(SLUG_URL, FALLBACK_URL)).toBe(true);
  });

  it("does NOT preserve when existing is already the fallback URL", () => {
    expect(shouldPreserveAbsoluteUrl(FALLBACK_URL, FALLBACK_URL)).toBe(false);
  });

  it("does NOT preserve when existing is the broken Ashby URL", () => {
    // We WANT sync to overwrite the broken URL with the fallback.
    expect(shouldPreserveAbsoluteUrl(BROKEN_ASHBY_URL, FALLBACK_URL)).toBe(false);
  });

  it("does NOT preserve when existing is null", () => {
    expect(shouldPreserveAbsoluteUrl(null, FALLBACK_URL)).toBe(false);
  });

  it("does NOT preserve when incoming is null", () => {
    expect(shouldPreserveAbsoluteUrl(SLUG_URL, null)).toBe(false);
  });

  it("does NOT preserve a slug URL if incoming is also a non-fallback URL", () => {
    // Both look custom; let sync write the latest.
    const otherCustom = "https://cursor.com/careers/different-role";
    expect(shouldPreserveAbsoluteUrl(SLUG_URL, otherCustom)).toBe(false);
  });

  it("preserves cleanest URL even when existing has multiple path segments", () => {
    const deep = "https://onereal.com/pages/careers/sales-rep";
    const fallback = "https://onereal.com/pages/careers?ashby_jid=abc-def";
    expect(shouldPreserveAbsoluteUrl(deep, fallback)).toBe(true);
  });

  it("does NOT preserve a Greenhouse-hosted URL even at deep path depth", () => {
    const ghHosted = "https://job-boards.greenhouse.io/anthropic/jobs/123456";
    const incoming = "https://www.anthropic.com/jobs/123456";
    // Existing is on greenhouse.io — not "curated" custom domain, so sync
    // should be allowed to upgrade.
    expect(shouldPreserveAbsoluteUrl(ghHosted, incoming)).toBe(false);
  });
});
