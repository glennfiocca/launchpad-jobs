@AGENTS.md

## Project notes

### Logo overrides
- `CompanyLogoOverride` DB table is the runtime source of truth.
- `src/lib/company-logo/overrides.ts` is now a deploy-time seed only —
  apply via `npm run db:seed-overrides` (idempotent upsert).
- Read path is gated by `LOGO_OVERRIDES_FROM_DB` (DB → TS map fallthrough).

### Orphan-logo prune
- Weekly cron lives in `scripts/prune-orphan-logos.ts`.
- Runs Sundays at 04:00 UTC.
- TODO: schedule entry pending in `.do/app.yaml jobs[]` per the comment
  block at the top of the script.

### Sync heartbeat + alerting
- Healthchecks.io covers the 6h sync cadence (`HEALTHCHECKS_URL`).
- Failure routes to Sentry (`tags.component=sync`) and the daily admin
  digest email at 09:00 UTC.
- Operator runbook: `docs/sync-playbook.md`.

### Apply URL fields on `Job`
- `applyUrl` is now distinct from `absoluteUrl`.
- Same value for Ashby self-hosters; different for hosted Ashby and
  Greenhouse self-hosters (where `applyUrl` is the rewritten target).
- Playwright apply consumes `applyUrl` when `APPLY_USE_CUSTOM_URLS=true`.

### Durable E2E test user
- `e2e-test@trypipeline.ai` is permanently seeded in both **prod** and the
  **local dev DB** (`User.id = cmpe2etest0000glenneeeeeee`, `UserProfile.id
  = cmpe2etestprof0000glenneeeee`). Pre-loaded with partial profile data:
  identity + location SF/CA + 2 work experiences (Stripe current + Affirm
  past) + 3 skills across tiers 5/4/2. Empty axes — resume, education,
  projects/certs, preferences — exercise the sigil's perimeter hit-area
  and "invite to fill" tooltip copy.
- Used via `e2e/_helpers/auth.ts → signInAsTestUser(context, "e2e-test@trypipeline.ai")`.
- Re-seed any time via `npx tsx scripts/seed-e2e-test-user.ts` (idempotent
  upserts; safe to re-run against either DB; uses `.env` DATABASE_URL).
- Endpoint allowlist (`/api/test/signin-as`) is `e2e-*@trypipeline.ai` —
  safe to keep mounted in prod since only allowlisted emails can mint
  sessions, and the secret must also match `TEST_AUTH_SECRET` from env.
- DO NOT delete the user. Add new test users with new IDs if specs need
  additional fixtures.

### Running Playwright locally
1. `.env.local` overrides `DATABASE_URL` + `DIRECT_URL` to point at the
   local Postgres (`postgresql://glennfiocca@localhost:5432/launchpad`).
   This is intentional — dev work stays off prod.
2. Local DB schema must be current. To sync after a schema change:
   - Temporarily put the local URL in `.env` (or `unset DATABASE_URL` in
     shell and export the local one) so Prisma CLI picks it up.
   - `npx prisma db push --skip-generate` to sync without writing a
     migration entry. Restore prod `.env` afterward.
3. Seed the test user into the local DB if not yet present:
   `npx tsx scripts/seed-e2e-test-user.ts` (after step 2 so the
   `targetRoles`/`requiredLanguages` columns exist).
4. Make sure `.env` has `TEST_AUTH_SECRET` (generate via
   `openssl rand -base64 32` if missing). Same value goes in DO env vars
   if running Playwright against prod.
5. Run the suite: `BASE_URL=http://localhost:3000 npx playwright test`
   (Playwright auto-starts the dev server via `playwright.config.ts`'s
   `webServer` block, OR you can run `npm run dev` separately and point
   `BASE_URL` at it).
6. For SVG `<g role="button">` triggers (sigil vertices), use `.focus()`
   instead of `.hover()` — Radix Tooltip opens on both, and `.focus()`
   is unambiguous for collapsed-vertex empty axes.
