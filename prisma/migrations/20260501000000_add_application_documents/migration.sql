-- CreateTable: ApplicationDocument
CREATE TABLE "ApplicationDocument" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "spacesKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationDocument_spacesKey_key" ON "ApplicationDocument"("spacesKey");
CREATE UNIQUE INDEX "ApplicationDocument_applicationId_kind_key" ON "ApplicationDocument"("applicationId", "kind");
CREATE INDEX "ApplicationDocument_applicationId_idx" ON "ApplicationDocument"("applicationId");
CREATE INDEX "ApplicationDocument_kind_idx" ON "ApplicationDocument"("kind");

-- AddForeignKey
ALTER TABLE "ApplicationDocument"
  ADD CONSTRAINT "ApplicationDocument_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
