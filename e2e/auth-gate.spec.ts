import { test, expect } from "@playwright/test";

/**
 * Auth gate — middleware should redirect anonymous visitors away from
 * protected paths. The redirect target preserves the original URL via
 * `callbackUrl` so the user lands back where they started after signin.
 */

test.describe("auth gate", () => {
  test("anonymous user hitting /profile is redirected to signin", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/auth\/signin/);
    // callbackUrl param preserves the original target.
    expect(page.url()).toContain("callbackUrl");
    expect(decodeURIComponent(page.url())).toContain("/profile");
  });

  test("anonymous user hitting /dashboard is redirected to signin", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/signin/);
    expect(decodeURIComponent(page.url())).toContain("/dashboard");
  });
});
