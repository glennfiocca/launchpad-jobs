import { test, expect } from "@playwright/test";

/**
 * Smoke — confirms the deploy isn't broken.
 *
 * These tests hit public endpoints directly via APIRequestContext (no browser)
 * so they fail fast and cheaply when the server is down or routes regressed.
 * Anything that requires JS hydration belongs in the other specs.
 */

test.describe("smoke", () => {
  test("public pages return 200 with expected content", async ({ request }) => {
    const root = await request.get("/");
    expect(root.status()).toBe(200);
    const rootText = await root.text();
    // Brand string lives in the layout <title> for every page.
    expect(rootText).toContain("Pipeline");

    const jobs = await request.get("/jobs");
    expect(jobs.status()).toBe(200);

    const sitemap = await request.get("/sitemap-index.xml");
    expect(sitemap.status()).toBe(200);
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain("<sitemapindex");

    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain("Sitemap:");
  });

  test("a seeded job detail page renders with JobPosting JSON-LD", async ({
    request,
  }) => {
    const res = await request.get("/jobs/PLE2E0000001");
    expect(res.status()).toBe(200);

    const html = await res.text();
    // JSON-LD is emitted via JSON.stringify (compact), so the schema marker
    // is a stable substring.
    expect(html).toContain('"@type":"JobPosting"');
    expect(html).toContain("Senior Backend Engineer");
    expect(html).toContain("E2E Test Company");
  });
});
