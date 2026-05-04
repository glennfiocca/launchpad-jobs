import type { BrowserContext } from "@playwright/test";

/**
 * Test-only signin helper.
 *
 * Calls POST /api/test/signin-as with the shared TEST_AUTH_SECRET, which
 * mints a NextAuth session-token cookie and attaches it to the supplied
 * BrowserContext via Set-Cookie. Subsequent navigations from that context
 * (or any page launched off it) are signed in as the requested test user.
 *
 * The endpoint enforces a hard email allowlist (e2e-*@trypipeline.ai) and
 * returns 404 in production builds when the secret is unset, so this helper
 * is safe even if accidentally invoked outside the test environment.
 *
 * Throws on:
 *   - Missing TEST_AUTH_SECRET in the runner env (configuration error)
 *   - Non-2xx response (seed not run, wrong secret, allowlist mismatch)
 */
const TEST_AUTH_SECRET = process.env.TEST_AUTH_SECRET;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export async function signInAsTestUser(
  context: BrowserContext,
  email: string,
): Promise<void> {
  if (!TEST_AUTH_SECRET) {
    throw new Error(
      "TEST_AUTH_SECRET env var is required to run E2E tests. " +
        "Set it locally and in CI to enable the test signin bypass.",
    );
  }

  const response = await context.request.post(
    `${BASE_URL}/api/test/signin-as`,
    {
      data: { email, secret: TEST_AUTH_SECRET },
    },
  );

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(
      `Test signin failed for ${email}: ${response.status()} ${body}`,
    );
  }
  // The endpoint sets the next-auth.session-token cookie via Set-Cookie.
  // Playwright's context.request shares its cookie jar with context, so any
  // page launched from this context is now signed in.
}
