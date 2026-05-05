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
