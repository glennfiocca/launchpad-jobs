import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Apply modal — confirms a complete-profile user can open the apply
 * flow on a seeded job detail page.
 *
 * Important: the modal auto-submits when the upstream ATS reports zero
 * unanswered questions, which would create a real application row (and
 * in production try to push to Greenhouse). To keep this test isolated:
 *
 *   - Stub /api/jobs/[id]/questions with one synthetic required question
 *     so the modal stays open instead of auto-submitting.
 *   - Stub POST /api/applications with a 200 belt-and-suspenders so any
 *     accidental submit is a no-op.
 *
 * We don't click Submit — opening the modal is the surface under test.
 */

test.describe("apply modal", () => {
  test("signed-in user with complete profile can open the apply modal", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, "e2e-test@trypipeline.ai");

    // Stub questions: a single required text field keeps the modal in its
    // form state (no auto-submit path).
    await page.route("**/api/jobs/*/questions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: "synthetic-q1",
              label: "Why are you interested in this role?",
              fieldType: "textarea",
              required: true,
              source: "test",
            },
          ],
        }),
      });
    });

    // Belt-and-suspenders: never let an actual apply request reach the
    // server during this test. The modal can't reach this code path
    // without a click on Submit, but route stubs are cheap insurance.
    await page.route("**/api/applications", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { applicationId: "stub-application-id" },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/jobs/PLE2E0000001");

    // The detail page renders "Apply with Pipeline" as the CTA. Use a
    // forgiving regex so a future copy tweak ("Apply with Pipeline →")
    // doesn't break the test.
    const applyButton = page.getByRole("button", {
      name: /apply with pipeline/i,
    });
    await expect(applyButton).toBeVisible();
    await applyButton.click();

    // Modal root is tagged with role="dialog" + data-testid="apply-modal".
    const modal = page.getByTestId("apply-modal");
    await expect(modal).toBeVisible();
    // The synthetic question label proves the questions stub round-tripped
    // through the modal's loadData effect.
    await expect(
      modal.getByText("Why are you interested in this role?"),
    ).toBeVisible();
  });
});
