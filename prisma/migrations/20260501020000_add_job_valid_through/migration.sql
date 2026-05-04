-- Add JobPosting validity window for Google structured data compliance.
-- Adding a nullable column on Postgres is metadata-only (no table rewrite),
-- safe to run under load.
ALTER TABLE "Job" ADD COLUMN "validThrough" TIMESTAMP(3);
CREATE INDEX "Job_validThrough_idx" ON "Job"("validThrough");

-- Backfill: 30-day default from postedAt for existing rows. Sync will
-- refresh this on next run.
UPDATE "Job"
SET "validThrough" = "postedAt" + INTERVAL '30 days'
WHERE "validThrough" IS NULL AND "postedAt" IS NOT NULL;
