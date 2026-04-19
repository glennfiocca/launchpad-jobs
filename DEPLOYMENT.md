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

**Job timeout:** 1800 seconds (30 minutes). Adjust `timeout_seconds` in `.do/app.yaml` if syncs routinely exceed this.

## Operator Runbook: Stuck Sync

If the admin sync dashboard shows a run permanently stuck in `Running` state:

### Automatic recovery
The `scripts/sync-cron.ts` cron calls `reconcileStaleRuns()` at startup before each run. Any `RUNNING` row older than **4 hours** is automatically marked `FAILURE` with a descriptive error summary. So the stuck row will be cleared on the next scheduled run.

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
The stale threshold defaults to 4 hours. To override, pass `thresholdMs` to `reconcileStaleRuns()`:
```typescript
await reconcileStaleRuns(2 * 60 * 60 * 1000) // 2 hours
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
