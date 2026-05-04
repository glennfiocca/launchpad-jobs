import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the launchpad E2E suite.
 *
 * Test files live under `e2e/` (separate from `src/` so Vitest doesn't try to
 * pick them up). Locally Playwright manages the Next.js server via the
 * `webServer` block; in CI the workflow builds + serves separately so that
 * the build step is cached and timed independently.
 *
 * BASE_URL escape hatch: set BASE_URL to point at any deployed environment
 * (staging, production smoke, a preview branch) and the suite will run
 * against it without touching `webServer`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["**/*.spec.ts"],

  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },

  // Serial for now — these tests share a single seeded database. Once each
  // spec owns its own fixture (per-test seed namespace or transactional
  // rollback) flip this to true for ~Nx speedup.
  fullyParallel: false,

  // Forbid `test.only` from accidentally landing on main.
  forbidOnly: !!process.env.CI,

  // Flake mitigation in CI only — locally a failure should be loud and immediate.
  retries: process.env.CI ? 2 : 0,

  // Single worker keeps DB-state-dependent tests deterministic. Revisit when
  // fullyParallel flips to true.
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ["html", { open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Mobile is intentionally out of scope for now — add a `mobile-chrome`
    // project here when responsive flows need coverage.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // When BASE_URL is unset, run the production server locally. CI sets
  // BASE_URL=http://localhost:3000 explicitly, which short-circuits this and
  // lets the workflow control build + serve as separate, cacheable steps.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
