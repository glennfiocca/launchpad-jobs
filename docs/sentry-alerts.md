# Sentry Alert Rules — Sync Pipeline

**Status**: rules below are the intended config. They live in the Sentry UI
(Issues → Alerts → Create Alert Rule), not in code. This doc is the
operator's reference for what to provision.

**Source**: Track C.2.5 in [`HARDENING_PLAN.md`](./HARDENING_PLAN.md).

---

## Context

`scripts/sync-cron.ts` (DO scheduled job, every 6h) calls `runSync()` from
`src/lib/sync-runner.ts`. Both the per-board catch and the top-level catch
in `sync-runner.ts` now call `Sentry.captureException(err, { tags: { component: "sync", ... } })`.

Filter on `tags.component:sync` to scope these alerts to the sync pipeline
and keep them isolated from web-service errors.

---

## Alert rule 1 — first occurrence (page)

**Why**: a fresh failure mode is the most actionable signal. Page once on
the first event so the operator investigates immediately.

| Field | Value |
|---|---|
| Name | `[sync] First occurrence of new issue` |
| When | `A new issue is created` |
| If | `event.tags.component equals sync` |
| Then | Send a notification to the on-call channel (Slack / email / PagerDuty) |
| Frequency | `Every 1 minute` (Sentry's tightest interval) |

---

## Alert rule 2 — rollup every 10 events

**Why**: an ongoing failure (e.g. one board's API is hard-down) shouldn't
spam after the first page, but the operator should be reminded that it's
still happening.

| Field | Value |
|---|---|
| Name | `[sync] Rollup — 10 errors in 1h` |
| When | `An issue is seen more than 10 times in 1 hour` |
| If | `event.tags.component equals sync` |
| Then | Send a notification to the on-call channel |
| Frequency | `Every 60 minutes` |

---

## Alert rule 3 — daily summary

**Why**: low-noise daily roll-up so the operator sees patterns even when
no single rule fires. Sentry's "Weekly Reports" feature handles weekly;
for daily, use a Metric Alert with a time-window aggregator.

Option A — built-in: subscribe the operator to Sentry's daily Summary
Email under **User Settings → Notifications → Email Routing**. Filter by
project (`launchpad-jobs`) and tag (`component:sync`) if the UI exposes
that filter.

Option B — Metric Alert (more reliable):

| Field | Value |
|---|---|
| Name | `[sync] Daily summary` |
| Metric | `count_of_events` |
| Filter | `event.tags.component:sync` |
| Aggregate | `count() over 24 hours` |
| Trigger | `≥ 1 event` |
| Schedule | Once daily at 09:00 UTC |
| Action | Email digest to admins |

---

## Verification

After provisioning:

1. Trigger a smoke test: hit `/api/sentry-smoke-test` (already wired up
   for the web service) to confirm the project's DSN is alive.
2. For sync-specific verification: temporarily edit a `CompanyBoard.boardToken`
   to a known-bad value, trigger a manual sync from `/admin/sync`, and
   confirm a Sentry event appears tagged `component:sync` within 60s.
3. Roll back the bad token, confirm rule 1 fires, then resolve the issue
   in Sentry.

---

## Related

- Tags emitted by sync code: `component`, `boardToken`, `provider`, `scope` (`top-level`).
- Extras emitted: `syncLogId`, `boardName`.
- Sync-jobs env var added in `.do/app.yaml`: `SENTRY_DSN` (RUN_AND_BUILD_TIME, SECRET).
- Existing web-service Sentry config: [`sentry.server.config.ts`](../sentry.server.config.ts), [`sentry.client.config.ts`](../sentry.client.config.ts), [`sentry.edge.config.ts`](../sentry.edge.config.ts).
