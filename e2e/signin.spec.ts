import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Signin — exercises the test-only bypass endpoint.
 *
 * After a successful signin the protected /dashboard route should load
 * without redirecting back to /auth/signin. We don't assert on a specific
 * dashboard widget because the dashboard's contents will churn over time;
 * the absence of a redirect is the load-bearing signal.
 */

test.describe("signin", () => {
  test("signed-in test user lands on dashboard after signin", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(\?|$|\/)/);
    // No redirect to /auth/signin = success.
    expect(page.url()).not.toContain("/auth/signin");
  });
});
