# Launchpad Deployment Guide

## Prerequisites

- DigitalOcean account
- GitHub repo: `glennfiocca/launchpad-jobs`
- Domain name (optional, for custom email tracking)

## Services Required

| Service | Purpose | Cost |
|---------|---------|------|
| DigitalOcean App Platform | Hosting the Next.js app | ~$5/mo (starter) |
| DigitalOcean Managed PostgreSQL | Database | ~$15/mo (1 node) |
| Resend | Transactional + inbound email | Free tier (3k/mo) |
| Anthropic API | AI status classification | Pay per use |
| UploadThing | Resume file storage | Free tier |
| Google/GitHub OAuth | Authentication | Free |

## Setup Steps

### 1. Database (DigitalOcean Managed PostgreSQL)

1. Create a PostgreSQL 15 cluster in DigitalOcean
2. Create a database named `launchpad`
3. Copy the connection string — you'll need both `DATABASE_URL` and `DIRECT_URL`
4. Add your app's IP to the trusted sources

### 2. Authentication

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create an OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-app.ondigitalocean.app/api/auth/callback/google`
4. Copy Client ID and Secret

#### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set callback URL: `https://your-app.ondigitalocean.app/api/auth/callback/github`
4. Copy Client ID and Secret

### 3. Email (Resend)

1. Create account at [resend.com](https://resend.com)
2. Add and verify your domain
3. Create an API key
4. Set up inbound email routing for `track.trypipeline.ai` → `https://your-app/api/webhooks/resend`
5. Generate an inbound webhook secret

### 4. AI (Anthropic)

1. Create account at [console.anthropic.com](https://console.anthropic.com)
2. Generate an API key
3. Add to `ANTHROPIC_API_KEY`

### 5. File Storage (UploadThing)

1. Create account at [uploadthing.com](https://uploadthing.com)
2. Create an app
3. Copy App ID and Secret

### 6. Deploy to DigitalOcean

1. Install DigitalOcean CLI: `brew install doctl`
2. Authenticate: `doctl auth init`
3. Create app: `doctl apps create --spec .do/app.yaml`
4. Set all secret environment variables in the DigitalOcean App Platform dashboard
5. Or use the web UI: [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)

### 7. Run Database Migrations

After first deploy, the `migrate` job runs automatically as a pre-deploy step.

For manual migration:
```bash
DATABASE_URL="your-connection-string" npx prisma migrate deploy
```

### 8. Seed Job Listings

Trigger the initial job sync:
```bash
curl -X POST https://your-app.ondigitalocean.app/api/jobs/sync \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 9. Add Greenhouse Board Tokens

Edit `src/lib/greenhouse/sync.ts` and add entries to `SEED_BOARDS`:

```typescript
export const SEED_BOARDS = [
  { token: "your-company-token", name: "Company Name" },
  // ...
];
```

## Environment Variables Reference

See `.env.example` for all required variables.

### Environment Variables: Sync Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SYNC_STALE_THRESHOLD_MS` | `14400000` (4 hours) | Time in ms before a `RUNNING` sync is considered stale and eligible for auto-recovery. Set lower for faster auto-recovery, higher if syncs legitimately take very long. Set in the DO app spec or `.env`. |

## Adding New Companies

To add a new Greenhouse board:
1. Find the company's Greenhouse board token (usually `company-name` from their job listing URL: `jobs.greenhouse.io/company-name`)
2. Add to `SEED_BOARDS` in `src/lib/greenhouse/sync.ts`
3. Trigger a sync via `POST /api/jobs/sync`

## Sync Schedule

The Greenhouse board sync runs daily via DigitalOcean scheduled job (`sync-jobs` in `.do/app.yaml`).

**Cron expression:** `0 9 * * *`
**UTC time:** 09:00 UTC
**Eastern time:** 04:00 EST (November–March) / 05:00 EDT (March–November)

> **Note:** DigitalOcean App Platform cron does not support timezones. The cron expression
> `0 9 * * *` is exact in winter (EST = UTC−5) and 1 hour late in summer (EDT = UTC−4).
> To target 04:00 EDT year-round, change to `0 8 * * *` (which shifts to 03:00 EST in winter).
> Neither is perfect for all seasons without an external timezone-aware scheduler.

**Production trigger path:** `scripts/sync-cron.ts` (direct Prisma, no HTTP)
**Deprecated path:** `scripts/sync-cron.mjs` (HTTP-based, do not configure in DO)

> **Note:** The cron script no longer calls `reconcileStaleRuns()` separately — stale run reconciliation is now centralized inside `acquireSyncLock()`, which every sync trigger path (cron, admin, API) calls automatically.

**Job timeout:** 1800 seconds (30 minutes). Adjust `timeout_seconds` in `.do/app.yaml` if syncs routinely exceed this.

## Operator Runbook: Stuck Sync

If the admin sync dashboard shows a run permanently stuck in `Running` state:

### Automatic recovery
Stale run reconciliation is centralized inside `acquireSyncLock()`, which is called by **every** sync trigger path — cron, admin UI, and API. Any `RUNNING` row older than the stale threshold (default: **4 hours**) is automatically marked `FAILURE` with a descriptive error summary. This means a stuck row is cleared on the next sync trigger from **any** source, not just the cron.

### Manual recovery (immediate)
Run reconciliation directly:
```bash
DATABASE_URL="..." npx tsx -e "
import { reconcileStaleRuns } from './src/lib/sync-runner';
const n = await reconcileStaleRuns();
console.log('Reconciled', n, 'stale run(s)');
process.exit(0);
"
```

Or via raw SQL:
```sql
UPDATE "SyncLog"
SET
  status = 'FAILURE',
  "completedAt" = NOW(),
  "errorSummary" = 'Manually reconciled: was stuck in RUNNING state'
WHERE status = 'RUNNING'
  AND "startedAt" < NOW() - INTERVAL '4 hours';
```

### Threshold tuning
The stale threshold defaults to 4 hours. To override, set the `SYNC_STALE_THRESHOLD_MS` environment variable (in the DO app spec or `.env`):
```
SYNC_STALE_THRESHOLD_MS=7200000   # 2 hours
```

See [Environment Variables: Sync Configuration](#environment-variables-sync-configuration) for details.

## Operator Runbook: Manual Sync Trigger

The admin UI manual trigger (`POST /api/admin/jobs/sync`) is **fire-and-forget**: it returns `202 Accepted` immediately with `{ syncLogId, status: "RUNNING" }`. The actual sync runs in the background.

- **Admin UI**: Click "Trigger Sync" in the admin panel. The UI automatically polls `GET /api/admin/sync/{syncLogId}` for real-time status updates until the sync completes.
- **CLI trigger**:
  ```bash
  curl -X POST https://app.trypipeline.ai/api/admin/jobs/sync \
    -H "Authorization: Bearer YOUR_AUTH_TOKEN"
  ```
- **Check status**: `GET /api/admin/sync/{syncLogId}` returns the `SyncLog` with board-level results.
- If the admin UI shows **"A sync is already running"**, wait for it to complete or check sync logs at `/admin/sync`. The atomic concurrency guard (`INSERT ... WHERE NOT EXISTS`) prevents overlapping runs.

## Operator Runbook: Sync Health Check

### Diagnosing sync health

1. **Check sync logs** in the admin UI at `/admin/sync`. Each entry shows status, trigger source, timing, and board results.
2. **Verify cron is firing**: Look for daily entries with `triggeredBy=cron`. If no cron entries appear for >24 hours, check the DO scheduled job status in the DigitalOcean dashboard.
3. **Structured log search**: All sync operations log with `[sync]` prefix and `syncLogId=` for correlation. Search application logs with these patterns:
   - `[sync] Lock rejected` — concurrency guard blocked a duplicate run
   - `[sync] Reconciled stale run` — auto-recovery kicked in for a stuck run
   - `[sync] Fatal error` — sync crashed; check the full error for root cause
   - `[sync] Completed` — normal completion with board counts and duration
4. **Example log sequence** for a healthy sync:
   ```
   [sync] Lock acquired: syncLogId=abc-123 triggeredBy=admin:user@example.com
   [sync] Boards fetched: syncLogId=abc-123 count=115
   [sync] Board synced: syncLogId=abc-123 board=Stripe added=5 updated=12 deactivated=0 durationMs=1234
   [sync] Completed: syncLogId=abc-123 status=SUCCESS boards=115/115 durationMs=45000
   ```

## Operator Runbook: Clear Sync Logs (One-Time)

To clear all sync history (e.g., to remove test/stuck runs before going live):

**Step 1: Back up production database first**
```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

**Step 2: Dry run (check counts)**
```bash
DATABASE_URL="..." npx tsx scripts/clear-sync-logs.ts
```

**Step 3: Confirm deletion**
```bash
DATABASE_URL="..." npx tsx scripts/clear-sync-logs.ts --confirm
```

`SyncBoardResult` rows are deleted first, then `SyncLog` rows. Both tables will be empty after this operation. New sync runs will create fresh history.

> **Note:** This is irreversible. Only use this script when you want to wipe all sync history intentionally.

## Post-Fix Verification Checklist

Production verification steps after deploying the refactored sync system:

1. **Manual trigger test**: Click "Trigger Sync" in the admin UI. Should return instantly with a "Sync started..." message, then polling shows progress, then shows completion with board results.
2. **Wait for scheduled trigger**: Check sync logs the next day for a `triggeredBy=cron` entry. Confirm it completed with `SUCCESS` or `PARTIAL_FAILURE` (not stuck in `RUNNING`).
3. **Stale run simulation**: Insert a `RUNNING` row with an old `startedAt` timestamp, then trigger a sync. The stale row should be reconciled to `FAILURE`, and the new sync should proceed normally.
   ```sql
   INSERT INTO "SyncLog" (id, status, "startedAt", "triggeredBy")
   VALUES (gen_random_uuid(), 'RUNNING', NOW() - INTERVAL '5 hours', 'test:stale-simulation');
   ```
4. **Expected SyncLog states**:
   - `RUNNING` — sync is in progress
   - `SUCCESS` — all boards synced successfully
   - `PARTIAL_FAILURE` — some boards failed, others succeeded
   - `FAILURE` — all boards failed or a fatal error occurred
