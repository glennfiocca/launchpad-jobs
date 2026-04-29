-- Drop old unique indexes
DROP INDEX IF EXISTS "CompanyBoard_boardToken_key";
DROP INDEX IF EXISTS "Company_slug_key";
DROP INDEX IF EXISTS "Job_externalId_boardToken_key";

-- Create new composite unique indexes
CREATE UNIQUE INDEX "CompanyBoard_provider_boardToken_key" ON "CompanyBoard"("provider", "boardToken");
CREATE UNIQUE INDEX "Company_provider_slug_key" ON "Company"("provider", "slug");
CREATE UNIQUE INDEX "Job_provider_externalId_boardToken_key" ON "Job"("provider", "externalId", "boardToken");
