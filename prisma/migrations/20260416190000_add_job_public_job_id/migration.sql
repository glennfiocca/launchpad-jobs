-- AlterTable (nullable first for backfill)
ALTER TABLE "Job" ADD COLUMN "publicJobId" TEXT;

-- Deterministic unique external ids from existing rows
UPDATE "Job"
SET "publicJobId" = 'PL' || UPPER(SUBSTRING(MD5("id" || "createdAt"::text) FROM 1 FOR 10));

-- Unique constraint
CREATE UNIQUE INDEX "Job_publicJobId_key" ON "Job"("publicJobId");

-- Required column
ALTER TABLE "Job" ALTER COLUMN "publicJobId" SET NOT NULL;
