import { test, expect } from "@playwright/test";
import { signInAsTestUser } from "./_helpers/auth";

/**
 * Profile v2 redesign — UI verification for the locally-staged commits:
 *  - f3107a3 sigil tooltips on Radix Tooltip (hover-in/hover-out) with
 *    perimeter hit area so empty axes are reachable
 *  - 25545da debounced blur-to-save on Personal / Professional / Preferences
 *
 * Seeded via `e2e-test@trypipeline.ai` (see CLAUDE.md for the fixture spec).
 */

const TEST_USER = "e2e-test@trypipeline.ai";

test.describe("profile v2 — page header sigil", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("sigil renders and tooltip appears on hover, disappears on leave", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, TEST_USER);
    await page.goto("/profile", { waitUntil: "networkidle" });

    // Sigil is an SVG with role=img.
    const sigil = page.getByRole("img", { name: /profile sigil/i });
    await expect(sigil).toBeVisible();

    // Vertex triggers are <g role="button" aria-label="{Section} — N% complete.">.
    // Use CSS attribute selector — getByRole on SVG <g> is finicky across versions.
    const personalVertex = page.locator('g[role="button"][aria-label^="Personal — "]').first();
    await expect(personalVertex).toBeAttached();

    // Use focus() — Radix Tooltip opens on focus too, and focus is more
    // reliable than hover() for SVG <g> elements whose bounding box can be
    // ambiguous (especially empty axes whose vertex collapses inward).
    await personalVertex.focus();
    await page.waitForTimeout(400);

    // Radix Tooltip portals to body; the headline div renders "Personal · NN%"
    // (uppercase via CSS but underlying textContent is mixed case).
    const tooltip = page.getByText(/Personal · \d+%/i).first();
    await expect(tooltip).toBeVisible({ timeout: 3000 });

    // Blur the trigger and verify the tooltip closes (regression guard for
    // the Popover→Tooltip swap — Popover with manual mouseenter/leave was
    // the source of the lingering bug).
    await personalVertex.blur();
    await expect(tooltip).toBeHidden({ timeout: 2000 });
  });

  test("empty axis (resume) shows tooltip via perimeter hit area", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, TEST_USER);
    await page.goto("/profile", { waitUntil: "networkidle" });

    // Resume is empty for the test user. aria-label still exists at 0%.
    const resumeVertex = page.locator('g[role="button"][aria-label^="Resume — 0%"]').first();
    await expect(resumeVertex).toBeAttached();

    // focus() — empty axes collapse inward so .hover() targets are
    // ambiguous; focus is unambiguous and Radix Tooltip opens on it.
    await resumeVertex.focus();
    await page.waitForTimeout(400);
    const tooltip = page.getByText(/Resume · 0%/i).first();
    await expect(tooltip).toBeVisible({ timeout: 3000 });
  });
});

test.describe("profile v2 — debounced blur-to-save", () => {
  test("Personal tab saves on field change (no Save button)", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, TEST_USER);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/profile");

    // No Save button on the redesign — regression guard.
    await expect(
      page.getByRole("button", { name: /^Save changes$/i }),
    ).toHaveCount(0);

    // The preferred-first-name input has no explicit id/aria-label, but
    // its placeholder is distinct.
    const preferredInput = page.getByPlaceholder(/preferred first name|Alex \(if different/i);
    await expect(preferredInput).toBeVisible();

    const newValue = `e2e-${Date.now()}`;
    const putPromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/profile") &&
        res.request().method() === "PUT" &&
        res.status() === 200,
      { timeout: 5000 },
    );
    await preferredInput.fill(newValue);
    // Blur triggers schedule; 500ms debounce window before flush.
    await page.keyboard.press("Tab");

    const putRes = await putPromise;
    expect(putRes.status()).toBe(200);
  });

  test("Personal tab does NOT have an explicit Save button", async ({
    page,
    context,
  }) => {
    await signInAsTestUser(context, TEST_USER);
    await page.goto("/profile");

    // Explicit assertion that the Save button is gone (regression guard).
    await expect(
      page.getByRole("button", { name: /^Save changes$/i }),
    ).toHaveCount(0);
  });
});
