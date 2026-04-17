/**
 * GET /api/admin/health
 *
 * Admin-only diagnostic endpoint.  Verifies that Chromium can actually launch
 * in the current runtime environment.  Useful after a deploy or in CI to
 * confirm the libnspr4 / NSS dependency stack is present.
 *
 * Response shape:
 *   { ok: true,  playwrightOk: true,  browserVersion: "...", env: "..." }
 *   { ok: false, playwrightOk: false, error: "...",           env: "..." }
 */

import { NextResponse } from "next/server";
import { chromium } from "playwright";
import { requireAdminSession } from "../_helpers";
import { CHROMIUM_ARGS } from "@/lib/greenhouse/playwright-apply";

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const env = process.env.NODE_ENV ?? "unknown";
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? "(default / system)";

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    browser = await chromium.launch({ args: CHROMIUM_ARGS, headless: true });
    const version = browser.version();
    await browser.close();
    browser = null;

    return NextResponse.json({
      ok: true,
      playwrightOk: true,
      browserVersion: version,
      browsersPath,
      env,
    });
  } catch (err) {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    const message = err instanceof Error ? err.message : String(err);
    const hint =
      message.includes("libnspr4") || message.includes("shared libraries")
        ? "System libraries missing. Run: npx playwright install --with-deps chromium"
        : "See server logs for details.";

    return NextResponse.json(
      {
        ok: false,
        playwrightOk: false,
        error: message,
        hint,
        browsersPath,
        env,
      },
      { status: 500 }
    );
  }
}
