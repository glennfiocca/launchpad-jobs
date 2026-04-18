-- AlterTable: add operator queue fields to Application
ALTER TABLE "Application"
  ADD COLUMN "applicationSnapshot" JSONB,
  ADD COLUMN "claimedByUserId" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "dispatchMode" TEXT;

-- CreateIndex
CREATE INDEX "Application_submissionStatus_idx" ON "Application"("submissionStatus");
CREATE INDEX "Application_claimedByUserId_idx" ON "Application"("claimedByUserId");

-- AddForeignKey
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_claimedByUserId_fkey"
  FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: ApplicationAuditLog
CREATE TABLE "ApplicationAuditLog" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationAuditLog_applicationId_idx" ON "ApplicationAuditLog"("applicationId");
CREATE INDEX "ApplicationAuditLog_actorUserId_idx" ON "ApplicationAuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "ApplicationAuditLog"
  ADD CONSTRAINT "ApplicationAuditLog_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationAuditLog"
  ADD CONSTRAINT "ApplicationAuditLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
