-- LoginEvent — append-only audit trail of successful sign-ins. Written from
-- the NextAuth events.signIn handler (best-effort: a failed insert here must
-- never block authentication). Used by /settings/security to surface recent
-- activity. ipAddress / userAgent currently null (NextAuth's events object
-- does not expose request context); leaving the columns in place lets a
-- later middleware-based capture path populate them without a migration.

-- CreateTable: LoginEvent
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "provider" TEXT,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginEvent_userId_createdAt_idx" ON "LoginEvent"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
