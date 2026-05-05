import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

import { clickApplyTrigger } from "../src/lib/ats/providers/ashby/click-apply-trigger";

/**
 * Track A.2.4 smoke test — exercises `clickApplyTrigger` against offline
 * HTML fixtures that mirror the three apply-trigger shapes we observed on
 * Ashby self-hosters:
 *
 *   - cursor.html    — `<a href="#apply">` reveals a hidden form
 *   - fullstory.html — `<button>Apply</button>` with form already in DOM
 *   - deel.html      — `<a>Apply for this job</a>` reveals a hidden form
 *
 * No live network involved. Each fixture is loaded via `page.setContent()`
 * so the test is hermetic and runs without the Next.js dev server.
 */

const FIXTURE_DIR = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "self-hosters"
);

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

test.describe("clickApplyTrigger", () => {
  // Fixture-only — uses page.setContent(), no goto, no webServer dependency.
  // Runs identically against local + deployed envs.

  test("clicks `a[href=\"#apply\"]` and reveals form (cursor)", async ({
    page,
  }) => {
    await page.setContent(readFixture("cursor.html"));

    // Form starts hidden.
    expect(await page.locator("#application-form").isVisible()).toBe(false);

    const result = await clickApplyTrigger(page);

    expect(result.clicked).toBe(true);
    expect(result.selector).toBe('a[href="#apply"]');
    expect(await page.locator("#application-form").isVisible()).toBe(true);
  });

  test("clicks `button:has-text(\"Apply\")` (fullstory, form already in DOM)", async ({
    page,
  }) => {
    await page.setContent(readFixture("fullstory.html"));

    const result = await clickApplyTrigger(page);

    expect(result.clicked).toBe(true);
    // Order matters: fullstory has a `button:has-text("Apply")` but no
    // `a[href="#apply"]`, so the third selector in the chain wins.
    expect(result.selector).toBe('button:has-text("Apply")');
    expect(await page.locator("#application-form").isVisible()).toBe(true);
  });

  test("clicks `a:has-text(\"Apply for this job\")` (deel)", async ({
    page,
  }) => {
    await page.setContent(readFixture("deel.html"));

    expect(await page.locator("#application-form").isVisible()).toBe(false);

    const result = await clickApplyTrigger(page);

    expect(result.clicked).toBe(true);
    expect(result.selector).toBe('a:has-text("Apply for this job")');
    expect(await page.locator("#application-form").isVisible()).toBe(true);
  });

  test("returns {clicked:false} when no trigger is on the page", async ({
    page,
  }) => {
    // A page with a form but no apply trigger — generic chain misses entirely.
    // The helper should report clicked=false (caller's waitForFormLoad
    // handles the form-already-rendered case).
    await page.setContent(`
      <!doctype html>
      <html><body>
        <form id="application-form">
          <input name="_systemfield_email" />
        </form>
      </body></html>
    `);

    const result = await clickApplyTrigger(page);

    expect(result.clicked).toBe(false);
    expect(result.selector).toBe(null);
  });

  test("honours per-company override selector", async ({ page }) => {
    await page.setContent(`
      <!doctype html>
      <html><body>
        <button id="weird-apply" data-custom="apply-me">Get started</button>
        <form id="application-form" style="display:none"></form>
        <script>
          document.getElementById("weird-apply").addEventListener("click", function () {
            document.getElementById("application-form").style.display = "block";
          });
        </script>
      </body></html>
    `);

    const result = await clickApplyTrigger(page, '[data-custom="apply-me"]');

    expect(result.clicked).toBe(true);
    expect(result.selector).toBe('[data-custom="apply-me"]');
  });
});
