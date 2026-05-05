import type { Page } from "playwright";

/**
 * Total time budget for finding + clicking an apply trigger. Per-call, not
 * per-selector — `Promise.race` against this caps the worst case so a missing
 * trigger doesn't burn the apply flow's overall timeout.
 *
 * Background: Ashby self-hosters (Track A.2 of HARDENING_PLAN.md) render
 * the company careers page at the rewritten `applyUrl` rather than a bare
 * Ashby form. The user has to click an "Apply" button to expose the form.
 * This helper races a fallback chain of selectors and clicks the first hit.
 */
const TRIGGER_BUDGET_MS = 3_000;

/**
 * After clicking, wait for the form to appear OR a brief settle delay,
 * whichever comes first. The settle delay covers cases where the click
 * scrolls to / unhides an in-page form rather than dispatching a fetch.
 */
const POST_CLICK_FORM_TIMEOUT_MS = 3_000;
const POST_CLICK_SETTLE_MS = 1_000;

/** Generic selector chain — first visible match wins. Order matters. */
const GENERIC_APPLY_SELECTORS: readonly string[] = [
  'a[href="#apply"]',
  'a:has-text("Apply for this job")',
  'button:has-text("Apply")',
  '[data-action="apply"]',
];

export interface ClickApplyTriggerResult {
  clicked: boolean;
  selector: string | null;
}

/**
 * Try to find and click an apply-trigger button on the page.
 *
 * Selector chain:
 *   1. If `applySelector` (per-company override) is non-null → try ONLY that
 *   2. `a[href="#apply"]`
 *   3. `a:has-text("Apply for this job")`
 *   4. `button:has-text("Apply")`
 *   5. `[data-action="apply"]`
 *
 * Behaviour:
 *   - First selector that becomes visible within the 3s total budget wins.
 *   - On match: click it, wait for either a `form` element to appear OR a
 *     short settle delay, then return `{ clicked: true, selector }`.
 *   - On miss (no selector visible within the budget): return
 *     `{ clicked: false, selector: null }` — the caller's `waitForFormLoad`
 *     handles the case where the form was already on the page.
 *   - Per-selector errors are logged and swallowed; the helper never throws.
 */
export async function clickApplyTrigger(
  page: Page,
  applySelector?: string | null
): Promise<ClickApplyTriggerResult> {
  const candidates: readonly string[] = applySelector
    ? [applySelector]
    : GENERIC_APPLY_SELECTORS;

  // Race every candidate against the total budget. The first locator to
  // become visible wins. We avoid `Promise.race` because we want the *first
  // resolving* (visible) selector, not the first *settling* (which could be
  // a rejection from a fast miss).
  const start = Date.now();
  let winner: string | null = null;

  // Build a parallel race: each entry resolves with the selector string when
  // visible, or rejects (via timeout) when not. We then pick the first to
  // resolve. Errors are caught so a bad selector can't kill the helper.
  const probes: Array<Promise<string>> = candidates.map((sel) =>
    page
      .locator(sel)
      .first()
      .waitFor({ state: "visible", timeout: TRIGGER_BUDGET_MS })
      .then(() => sel)
  );

  try {
    winner = await Promise.any(probes);
  } catch {
    // Promise.any rejects with AggregateError when ALL probes fail (none
    // matched within the budget). That's the expected miss case.
    const elapsed = Date.now() - start;
    console.log(
      `[ashby-apply] No apply trigger found in ${elapsed}ms (tried ${candidates.length} selectors)`
    );
    return { clicked: false, selector: null };
  }

  // Click the winning selector. Wrap in try/catch so a click error (e.g.
  // element disappeared between visibility check and click) returns a clean
  // miss rather than throwing into the apply flow.
  try {
    await page.locator(winner).first().click({ timeout: 2_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ashby-apply] Apply trigger matched (${winner}) but click failed: ${msg}`
    );
    return { clicked: false, selector: winner };
  }

  // Post-click: wait for a form to appear OR a brief settle delay, whichever
  // comes first. Many self-hosters reveal an in-page form on click; others
  // navigate or load content async.
  await Promise.race([
    page
      .locator("form")
      .first()
      .waitFor({ state: "visible", timeout: POST_CLICK_FORM_TIMEOUT_MS })
      .catch(() => undefined),
    page.waitForTimeout(POST_CLICK_SETTLE_MS),
  ]);

  console.log(`[ashby-apply] Apply trigger clicked (selector: ${winner})`);
  return { clicked: true, selector: winner };
}
