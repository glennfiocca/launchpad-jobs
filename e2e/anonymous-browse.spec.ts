import { test, expect } from "@playwright/test";

/**
 * Anonymous browse — confirms a logged-out visitor can find jobs and open
 * a detail view.
 *
 * Note on URL shape: the JobBoard list+detail layout uses a `?job=` query
 * param to swap in the side-panel detail view rather than navigating to
 * /jobs/[publicJobId]. Both URL shapes resolve the same fixture, so the
 * test asserts the URL contains the seeded publicJobId without locking
 * the test to a specific shape.
 */

test.describe("anonymous browse", () => {
  test("anonymous user can browse jobs and click through to a detail view", async ({
    page,
  }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/jobs/);

    // Wait for the list to render. The seed includes "Senior Backend Engineer"
    // (PLE2E0000001). The card uses a button role with the title as an h3
    // descendant, so role+name finds the clickable card directly.
    const card = page.getByRole("button", { name: /Senior Backend Engineer/i });
    await expect(card.first()).toBeVisible();
    await card.first().click();

    // After click the URL gains ?job=PLE2E0000001 (or path /jobs/PLE2E...).
    await expect(page).toHaveURL(/PLE2E0000001/);

    // Side-panel detail view shows the job title in a heading.
    await expect(
      page.getByRole("heading", { name: /Senior Backend Engineer/i }).first(),
    ).toBeVisible();
  });
});
