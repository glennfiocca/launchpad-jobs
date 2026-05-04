import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Phase 1 settings hub — exercises the avatar dropdown trigger in the
 * sidebar, navigation into /settings, in-place display name edit, the
 * sidenav active state, and the legacy /settings/account redirect.
 *
 * Avatar upload is skipped: testing it would require either a live DO
 * Spaces credential or a brittle network-mock — both worse than just
 * asserting the API contract via vitest (which we already do).
 */

test.describe("settings hub", () => {
  test("user can open account menu and edit display name", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/dashboard");

    // The sidebar dropdown trigger is labeled "Account menu" in both variants.
    await page.getByRole("button", { name: "Account menu" }).first().click();

    // The menu's "Account" item links to /settings.
    await page.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    // Account sidenav row is active (violet).
    const accountNav = page
      .getByRole("navigation", { name: "Settings" })
      .first()
      .getByRole("link", { name: "Account" });
    await expect(accountNav).toHaveClass(/violet-/);

    // Edit display name and save.
    const nameInput = page.getByLabel("Display name");
    await nameInput.fill("");
    await nameInput.fill("Phase One Tester");
    await page.getByRole("button", { name: /Save changes/ }).click();

    // Sonner toast confirms persistence.
    await expect(page.getByText("Profile saved")).toBeVisible();

    // Reload — value should still be there.
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue(
      "Phase One Tester",
    );
  });

  test("legacy /settings/account redirects to /settings/privacy", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    const response = await page.goto("/settings/account");
    // Next.js redirect() in a server component renders the destination URL.
    await expect(page).toHaveURL(/\/settings\/privacy$/);
    // Heading on the destination page.
    await expect(
      page.getByRole("heading", { name: "Privacy & data" }),
    ).toBeVisible();
    // Sanity: the response chain reached the privacy page (200).
    expect(response?.status()).toBeLessThan(400);
  });
});
