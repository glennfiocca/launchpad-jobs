-- BoardHosting enum: tracks how a company exposes their ATS to job seekers.
-- See prisma/schema.prisma for the field-level docs.
CREATE TYPE "BoardHosting" AS ENUM ('GREENHOUSE_HOSTED', 'ASHBY_HOSTED', 'SELF_HOSTED', 'UNKNOWN');

-- Add hosting + applyHostname to CompanyBoard. Both default to "unknown"
-- so existing rows are valid; the next sync populates them from the
-- jobs feed's hostname distribution.
ALTER TABLE "CompanyBoard"
  ADD COLUMN "hosting" "BoardHosting" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "applyHostname" TEXT;
