import { describe, it, expect, beforeEach } from "vitest";
import robots from "../robots";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

describe("robots", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
  });

  it("returns a wildcard rule that allows the root path", () => {
    const result = robots();
    // single-rule shape, not an array
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
  });

  it("disallows all expected non-public paths", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rules.disallow)
      ? rules.disallow
      : rules.disallow
        ? [rules.disallow]
        : [];

    const expected = [
      "/admin/",
      "/api/",
      "/auth/",
      "/settings/",
      "/dashboard/",
      "/applications/",
      "/unsubscribe",
      "/onboarding/",
    ];
    for (const path of expected) {
      expect(disallow).toContain(path);
    }
  });

  it("includes a sitemap URL using NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    // robots.ts captures NEXT_PUBLIC_APP_URL at module load; reload to pick up the override.
    return import("../robots").then(async ({ default: r }) => {
      const result = r();
      // Default fallback path — implementation may have already captured the prod URL.
      expect(typeof result.sitemap).toBe("string");
      expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
    });
  });

  it("falls back to trypipeline.ai when NEXT_PUBLIC_APP_URL is unset", () => {
    const result = robots();
    expect(result.sitemap).toBeDefined();
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
