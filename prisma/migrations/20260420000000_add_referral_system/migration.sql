-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'CONVERTED', 'EXPIRED', 'FLAGGED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('REFERRAL_BONUS', 'ADMIN_GRANT', 'ADMIN_DEDUCTION', 'REFERRAL_REVOKE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "normalizedEmail" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referralCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "signupIpAddress" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT,
    "referralCode" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "refereeIpAddress" TEXT,
    "referrerIpAddress" TEXT,
    "ipFlagged" BOOLEAN NOT NULL DEFAULT false,
    "firstApplicationAt" TIMESTAMP(3),
    "creditTransactionId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "referralId" TEXT,
    "actorUserId" TEXT,
    "note" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_creditTransactionId_key" ON "Referral"("creditTransactionId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE INDEX "Referral_referralCode_idx" ON "Referral"("referralCode");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "Referral_expiresAt_idx" ON "Referral"("expiresAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CreditTransaction_type_idx" ON "CreditTransaction"("type");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_creditTransactionId_fkey" FOREIGN KEY ("creditTransactionId") REFERENCES "CreditTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
