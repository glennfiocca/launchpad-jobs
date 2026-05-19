-- ReviewStatus enum: manual board onboarding workflow. PENDING is the
-- default so existing CompanyBoard rows stay dark until an admin approves.
-- See prisma/schema.prisma for the field-level docs.
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_REVIEW', 'REJECTED');

-- Add review-workflow columns to CompanyBoard. All have safe defaults so
-- existing rows remain valid; the admin queue will sweep PENDING rows.
ALTER TABLE "CompanyBoard"
  ADD COLUMN "reviewStatus"   "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt"     TIMESTAMP(3),
  ADD COLUMN "reviewedBy"     TEXT,
  ADD COLUMN "reviewerNotes"  TEXT,
  ADD COLUMN "suspiciousSlug" BOOLEAN        NOT NULL DEFAULT false;

CREATE INDEX "CompanyBoard_reviewStatus_idx" ON "CompanyBoard"("reviewStatus");

-- BoardReviewMiss: companies whose ATS slug derivation failed. Admin pastes
-- the correct slug + provider and the resolver promotes the row.
CREATE TABLE "BoardReviewMiss" (
  "id"                     TEXT            NOT NULL,
  "companyName"            TEXT            NOT NULL,
  "companyUrl"             TEXT,
  "linkedinUrl"            TEXT,
  "countryCode"            TEXT,
  "totalJobsTs"            INTEGER,
  "industry"               TEXT,
  "candidatesTried"        TEXT,
  "reviewStatus"           "ReviewStatus"  NOT NULL DEFAULT 'PENDING',
  "manuallyProvidedSlug"   TEXT,
  "manuallyProvidedAts"    "AtsProvider",
  "resolvedCompanyBoardId" TEXT,
  "reviewedAt"             TIMESTAMP(3),
  "reviewedBy"             TEXT,
  "reviewerNotes"          TEXT,
  "createdAt"              TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "BoardReviewMiss_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardReviewMiss_companyName_key" ON "BoardReviewMiss"("companyName");
CREATE INDEX "BoardReviewMiss_reviewStatus_idx" ON "BoardReviewMiss"("reviewStatus");

-- BoardReviewProgress: per-admin resume pointer so reviewers can pick up
-- where they left off across sessions.
CREATE TABLE "BoardReviewProgress" (
  "id"                  TEXT         NOT NULL,
  "adminUserId"         TEXT         NOT NULL,
  "lastReviewedBoardId" TEXT,
  "lastReviewedMissId"  TEXT,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BoardReviewProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BoardReviewProgress_adminUserId_key" ON "BoardReviewProgress"("adminUserId");
