-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILURE');

-- CreateEnum
CREATE TYPE "SyncBoardStatus" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "totalBoards" INTEGER NOT NULL DEFAULT 0,
    "boardsSynced" INTEGER NOT NULL DEFAULT 0,
    "boardsFailed" INTEGER NOT NULL DEFAULT 0,
    "totalAdded" INTEGER NOT NULL DEFAULT 0,
    "totalUpdated" INTEGER NOT NULL DEFAULT 0,
    "totalDeactivated" INTEGER NOT NULL DEFAULT 0,
    "totalApplicationsUpdated" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "errorSummary" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncBoardResult" (
    "id" TEXT NOT NULL,
    "syncLogId" TEXT NOT NULL,
    "boardToken" TEXT NOT NULL,
    "boardName" TEXT NOT NULL,
    "status" "SyncBoardStatus" NOT NULL,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "applicationsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "SyncBoardResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncBoardResult_syncLogId_idx" ON "SyncBoardResult"("syncLogId");

-- AddForeignKey
ALTER TABLE "SyncBoardResult" ADD CONSTRAINT "SyncBoardResult_syncLogId_fkey" FOREIGN KEY ("syncLogId") REFERENCES "SyncLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
