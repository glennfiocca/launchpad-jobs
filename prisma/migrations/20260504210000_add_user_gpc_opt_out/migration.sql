-- Add gpcOptOut to User. Set when an authenticated user's request carries
-- a Sec-GPC: 1 header (CCPA/CPRA universal opt-out signal). Once set to true,
-- never automatically reverted — the user must explicitly opt back in via
-- a future UI (out of scope for this migration). Adding a NOT NULL column
-- with a default is metadata-only on Postgres (no table rewrite).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "gpcOptOut" BOOLEAN NOT NULL DEFAULT false;
