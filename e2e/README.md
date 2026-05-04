# E2E Tests

Playwright suite for end-to-end coverage of critical user flows.

## First-time setup

Install the Chromium browser binary (~150MB, one-time):

```bash
npm run e2e:install
```

## Running locally

```bash
# Spin up Next.js automatically (via playwright.config.ts webServer) and run all specs
npm run e2e

# Same, but with a visible browser window for debugging
npm run e2e:headed

# Open the most recent HTML report
npm run e2e:report
```

The local config builds nothing — `npm run e2e` invokes `npm run start`, so
make sure you've run `npm run build` at least once before running the suite
locally. Or set `BASE_URL` (see below) to point at a server you're already
running.

## BASE_URL — point at any environment

Set `BASE_URL` to bypass the local web server and run specs against a deployed
target:

```bash
# Staging smoke
BASE_URL=https://staging.trypipeline.ai npm run e2e

# Production smoke (read-only specs only!)
BASE_URL=https://trypipeline.ai npm run e2e
```

When `BASE_URL` is set, Playwright skips the `webServer` block entirely.

## Fixture seed

The suite expects a seeded database. The seed script lives at
`prisma/seed-e2e.ts` and is invoked via:

```bash
npm run db:seed:e2e
```

It populates known-good users, jobs, and applications that the specs assert
against. Run this against a throwaway database — it truncates tables.

## CI

`.github/workflows/e2e.yml` runs the suite on every PR + push to `main` with
an ephemeral Postgres service container. On failure, the HTML report is
uploaded as a workflow artifact (open the run, scroll to "Artifacts").
