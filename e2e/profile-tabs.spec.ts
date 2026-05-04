import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Profile tabs — exercises the five-tab Radix Tabs nav and the
 * identity-gate that disables saves on non-Personal tabs when the
 * user hasn't filled in their name/email yet.
 *
 * Radix sets `data-state="active"` on the active trigger; we assert
 * against that attribute rather than the visual styling.
 */

test.describe("profile tabs", () => {
  test("signed-in user can navigate the 5 profile tabs and URL persists", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");
    await page.goto("/profile");

    const personalTab = page.getByRole("tab", { name: "Personal" });
    const educationTab = page.getByRole("tab", { name: "Education" });

    // Default tab — Personal — should be active on first load (no ?tab= param).
    await expect(personalTab).toHaveAttribute("data-state", "active");

    // Switch to Education and confirm the URL gains ?tab=education.
    await educationTab.click();
    await expect(page).toHaveURL(/[?&]tab=education/);
    await expect(educationTab).toHaveAttribute("data-state", "active");

    // Reload — active tab should persist via the query param.
    await page.reload();
    await expect(page).toHaveURL(/[?&]tab=education/);
    await expect(
      page.getByRole("tab", { name: "Education" }),
    ).toHaveAttribute("data-state", "active");

    // Bogus tab value should fall back to the default (Personal).
    await page.goto("/profile?tab=banana");
    await expect(
      page.getByRole("tab", { name: "Personal" }),
    ).toHaveAttribute("data-state", "active");
  });

  test("identity-required notice shows on non-Personal tabs for empty profile", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-empty@trypipeline.ai");
    await page.goto("/profile?tab=education");

    // The IdentityRequiredNotice renders this exact heading text.
    await expect(
      page.getByText("Complete the Personal tab first"),
    ).toBeVisible();

    // Save button is rendered with literal text "Save" and disabled
    // when identity is incomplete.
    await expect(page.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });
});
