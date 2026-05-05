-- Track B.4 of HARDENING_PLAN.md — promote the curated logo override map
-- (src/lib/company-logo/overrides.ts) from a TS constant to a runtime
-- DB-backed source-of-truth, so admins can edit overrides via UI without a
-- code deploy.
--
-- The TS map keeps working as a deploy-time seed (prisma/seed-overrides.ts)
-- and as a fallback when LOGO_OVERRIDES_FROM_DB=false, so this is non-breaking.
--
-- Metadata-only CREATE TABLE + UNIQUE INDEX → safe under load.
CREATE TABLE "CompanyLogoOverride" (
    "id" TEXT NOT NULL,
    "provider" "AtsProvider" NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "logoUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyLogoOverride_pkey" PRIMARY KEY ("id")
);

-- Enforce one override row per (provider, slug). Mirrors the `(provider, slug)`
-- key used in the TS map.
CREATE UNIQUE INDEX "CompanyLogoOverride_provider_slug_key" ON "CompanyLogoOverride"("provider", "slug");
