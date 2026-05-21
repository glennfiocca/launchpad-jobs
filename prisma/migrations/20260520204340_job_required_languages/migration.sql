-- Required-language slugs extracted from the job description at sync
-- time (see src/lib/jobs/language-extractor.ts). Stored as a text
-- array so the listing API can use `&&` overlap against the candidate
-- profile's spoken-language slugs. Empty array means "no explicit
-- language requirement" — that's the default for every existing row
-- so the migration is metadata-only (no table rewrite, no backfill
-- inside the DDL). The dedicated backfill lives at
-- scripts/backfill-job-languages.ts and is run once after deploy.
ALTER TABLE "Job"
  ADD COLUMN "requiredLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- GIN index for fast `&&` (array overlap) and `@>` (contains) queries.
-- The listing API's match filter is `Job.requiredLanguages && profile.spokenLanguages`,
-- which planner-wise only benefits from a GIN index — btree can't serve
-- array containment operators. Created CONCURRENTLY would be ideal at
-- 100k+ rows, but Prisma migrations run inside a transaction (where
-- CONCURRENTLY is forbidden); the table is small enough that an
-- in-transaction GIN build completes in seconds.
CREATE INDEX "Job_requiredLanguages_idx"
  ON "Job"
  USING GIN ("requiredLanguages");
