import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Phase 2 — billing relocation.
 *
 * Asserts that the legacy /billing route survives via a server-component
 * redirect into /settings/billing, that the redirect preserves any query
 * string (Stripe still bounces back to /billing?success=true on cached
 * sessions), and that the moved page renders the credits/plan content
 * inside the settings hub.
 */

test.describe("billing hub", () => {
  test("/billing redirects to /settings/billing", async ({ page, context }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    const response = await page.goto("/billing");
    await expect(page).toHaveURL(/\/settings\/billing$/);
    expect(response?.status()).toBeLessThan(400);
  });

  test("/billing?success=true preserves the query string", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/billing?success=true");
    await expect(page).toHaveURL(/\/settings\/billing\?success=true$/);
  });

  test("/settings/billing renders plan + credit content", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/settings/billing");
    // SectionCard heading set by the new page.
    await expect(
      page.getByRole("heading", { name: "Billing", level: 2 }),
    ).toBeVisible();
    // BillingClient always renders one of the two plan badges.
    const planLabel = page.getByText(/^(Free Plan|Pro Plan)$/);
    await expect(planLabel.first()).toBeVisible();
  });

  test("unauth /billing redirects to signin with callbackUrl", async ({
    page,
  }) => {
    // No signInAsTestUser — fresh context, no session cookie.
    await page.goto("/billing");
    // Middleware bounces unauthed protected routes to /auth/signin?callbackUrl=…
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/);
  });
});
