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
