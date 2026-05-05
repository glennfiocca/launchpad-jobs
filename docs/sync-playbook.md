# Sync Playbook

Operational guide for the 6-hour sync cron, heartbeat monitoring, and the
daily admin digest. Pairs with `docs/HARDENING_PLAN.md` Track C.

## Sync cadence

- DO scheduled job `sync-jobs` (see `.do/app.yaml`).
- Cron: `0 */6 * * *` UTC — fires at 00:00, 06:00, 12:00, 18:00 UTC daily.
- Pure UTC; does not auto-shift for DST.
- Entry point: `scripts/sync-cron.ts` → `runSync("cron")` in `src/lib/sync-runner.ts`.

## Heartbeat monitoring (Track C.3 — Healthchecks.io)

The cron pings Healthchecks.io at start, end, and on failure. If a ping
fails to arrive, Healthchecks alerts the owner over email/Slack within the
configured grace period.

### One-time signup (manual — not done by the orchestration)

1. Sign up at <https://healthchecks.io> — free tier, up to 20 checks. Create
   the account under the team email so alerts route correctly.
2. Create a new check named **"launchpad-jobs sync (6h)"** with:
   - **Schedule**: cron — `0 */6 * * *` (matches `.do/app.yaml`'s `sync-jobs.schedule.cron`).
   - **Grace period**: 30 minutes. (Median sync run is well under 30 min;
     anything beyond that is a real outage signal.)
   - **Tags**: `prod`, `sync`.
3. Copy the **ping URL** (looks like `https://hc-ping.com/<uuid>`) — this is
   the value of the `HEALTHCHECKS_URL` env var.
4. Set `HEALTHCHECKS_URL` in DigitalOcean: edit the `sync-jobs` env block in
   the app spec or set a project-level env var of the same name. The URL is
   write-only (leakage allows ping-spoofing only — no data exposure), so it's
   stored as a plain env var, not a `SECRET`.
5. Configure an integration in Healthchecks (email is enabled by default,
   Slack/PagerDuty optional) so the alert actually reaches a human.

### How the pings are wired

`scripts/sync-cron.ts` calls (in order):

- `POST {HEALTHCHECKS_URL}/start` immediately before `runSync()`.
- `POST {HEALTHCHECKS_URL}` on success (status `SUCCESS` or `PARTIAL_FAILURE`).
- `POST {HEALTHCHECKS_URL}/fail` on `FAILURE` or any uncaught exception.
- A neutral `POST {HEALTHCHECKS_URL}` is also sent when the run is skipped
  due to lock contention (`SyncAlreadyRunningError`). Lock contention is not
  an outage — emitting a normal heartbeat avoids false alerts.

Pings have a 5-second timeout and **never** propagate errors. If the
heartbeat service is down, the sync still runs.

If `HEALTHCHECKS_URL` is unset (e.g. local dev), the script no-ops the ping
calls. Same pattern as `SENTRY_DSN`.

### Verifying the alert pipeline (deferred — manual run)

Once the env var is set in DO, prove the alert path before relying on it:

1. In Healthchecks UI, temporarily change the check's schedule to fire every
   5 minutes (`*/5 * * * *`), keeping grace at 30 min.
2. In the next sync cycle, observe a `start` + `success` ping arrive.
3. Skip a run by leaving the cron schedule wrong — wait for the grace window
   to expire — confirm the email/Slack alert arrives.
4. Restore the original `0 */6 * * *` schedule.

Alternatively (no DO impact): use the Healthchecks UI's "Resume / Pause" + a
manual `curl https://hc-ping.com/<uuid>/fail` to trigger an alert. This is
the safer drill — it doesn't require touching the production schedule.

## Daily admin digest (Track C.4)

`scripts/sync-digest.ts` runs at 09:00 UTC daily as the `sync-digest`
scheduled job in `.do/app.yaml`. It:

1. Aggregates the prior 24h of `SyncLog` rows.
2. Resolves recipients from `users WHERE role = 'ADMIN'`.
3. Sends a single Resend email per admin recipient using the
   `syncDigestEmail` template in `src/lib/email-templates.ts`.

Per the plan, the digest fires **every** day, even on no-news days — the
"NO SYNCS RAN" banner serves as a silent-failure tripwire on top of the
Healthchecks heartbeat.

Required env vars (already in `.do/app.yaml`): `DATABASE_URL`, `DIRECT_URL`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, `SENTRY_DSN`.

## Sentry coverage

Both the cron and digest call `Sentry.init()` when `SENTRY_DSN` is present
(see `scripts/sync-cron.ts` and `scripts/sync-digest.ts`). Top-level
exceptions in the digest path call `Sentry.captureException` with
`tags.component = "sync-digest"` before exiting non-zero.

See [`docs/sentry-alerts.md`](./sentry-alerts.md) for the alert-rule config
that turns these captures into pages/notifications.

## Alert response

| Alert | First action |
|-------|--------------|
| Healthchecks.io: missed run | Open DO `sync-jobs` job logs for the expected fire time. Check Sentry for top-level errors. |
| Healthchecks.io: `/fail` ping | Open Sentry — board-level failures are tagged `component=sync`. Cross-check `SyncLog.errorSummary`. |
| Daily digest: "NO SYNCS RAN" banner | DO scheduled-job outage. Check the platform status + manual trigger via admin API. |
| Daily digest: failure count > 0 | Drill into per-board errors via `/admin/sync` dashboard. Common causes: ATS provider API outages, expired board tokens. |
