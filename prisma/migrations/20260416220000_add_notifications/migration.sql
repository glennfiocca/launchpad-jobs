-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPLIED', 'APPLICATION_STATUS_CHANGE', 'APPLICATION_OFFER', 'APPLICATION_INTERVIEW', 'APPLICATION_REJECTED', 'EMAIL_RECEIVED', 'LISTING_REMOVED', 'APPLY_FAILED', 'TEAM_MESSAGE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EmailFrequency" AS ENUM ('INSTANT', 'DAILY', 'NEVER');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "ctaUrl" TEXT,
    "ctaLabel" TEXT,
    "data" JSONB,
    "applicationId" TEXT,
    "jobId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailFrequency" "EmailFrequency" NOT NULL DEFAULT 'INSTANT',
    "emailOnOffer" BOOLEAN NOT NULL DEFAULT true,
    "emailOnInterview" BOOLEAN NOT NULL DEFAULT true,
    "emailOnStatusChange" BOOLEAN NOT NULL DEFAULT true,
    "emailOnEmailReceived" BOOLEAN NOT NULL DEFAULT false,
    "emailOnListingRemoved" BOOLEAN NOT NULL DEFAULT true,
    "emailOnTeamMessage" BOOLEAN NOT NULL DEFAULT true,
    "emailOnSystem" BOOLEAN NOT NULL DEFAULT true,
    "emailOnApplyFailed" BOOLEAN NOT NULL DEFAULT true,
    "lastDigestSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_applicationId_idx" ON "Notification"("applicationId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
