-- US-eligibility classification for jobs. Adds three fields:
--   countryCode       ISO-2 country code where the role is primarily located
--   locationCategory  Debug/admin field: US_BASED | REMOTE | MULTI_WITH_US | FOREIGN | UNKNOWN
--   isUSEligible      The bit consumed by the listing API. Default TRUE so
--                     existing rows remain visible until the backfill runs.
--
-- All columns are nullable / defaulted, so this migration is metadata-only
-- on Postgres (no table rewrite) and safe under load. The classifier backfill
-- is run separately via scripts/backfill-job-eligibility.ts.
ALTER TABLE "Job" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Job" ADD COLUMN "locationCategory" TEXT;
ALTER TABLE "Job" ADD COLUMN "isUSEligible" BOOLEAN NOT NULL DEFAULT true;

-- Index on the field every default query will filter against. Filtering on
-- a boolean alone is rarely worth indexing, but combined with isActive +
-- the high cardinality of provider/createdAt below it keeps the planner
-- honest as the table scales past 50k+ rows.
CREATE INDEX "Job_isUSEligible_idx" ON "Job"("isUSEligible");
