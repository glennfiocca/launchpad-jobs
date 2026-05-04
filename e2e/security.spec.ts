import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Phase 4 — /settings/security smoke spec.
 *
 * Verifies the page renders and exposes the activity card + sign-out button.
 * The actual click on "Sign out everywhere" is intentionally NOT exercised:
 * it would invalidate this test session and force a re-login mid-spec, which
 * adds flakiness without meaningful coverage. Vitest already proves the API
 * route increments tokenVersion + deletes Sessions on a 204.
 */

test.describe("settings security", () => {
  test("renders sign-in activity card and sign-out button", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/settings/security");

    await expect(
      page.getByRole("heading", { name: "Security" }),
    ).toBeVisible();

    // Activity card heading is always present (empty-state copy or table).
    await expect(
      page.getByRole("heading", { name: "Recent sign-in activity" }),
    ).toBeVisible();

    // Sign-out everywhere control is in the action slot.
    await expect(
      page.getByRole("button", { name: /Sign out everywhere/i }),
    ).toBeVisible();

    // "Coming soon" 2FA tile renders disabled (informational only).
    await expect(
      page.getByRole("heading", { name: "Two-factor authentication" }),
    ).toBeVisible();
  });
});
