-- Structured snapshot of the last Haiku resume extraction, plus the
-- timestamp of when it was generated. Both nullable: existing rows
-- have never been parsed and stay null until the user uploads a
-- resume. JSONB chosen over individual columns because the extracted
-- shape (skills array, nested educationTop) is read as a whole on the
-- profile page — no need for individual-field indexes. See
-- src/lib/profile/resume-types.ts for the canonical shape + Zod schema.
--
-- Both columns are nullable / unindexed, so this migration is metadata
-- only on Postgres (no table rewrite) and safe to run under load.
ALTER TABLE "UserProfile" ADD COLUMN "resumeExtracted" JSONB;
ALTER TABLE "UserProfile" ADD COLUMN "resumeExtractedAt" TIMESTAMP(3);
