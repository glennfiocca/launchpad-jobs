-- Track B.5 of HARDENING_PLAN.md — track WHERE each Company.logoUrl came
-- from so the admin sync dashboard can surface the distribution and we can
-- see what fraction of brands fall through to the render-time monogram
-- fallback.
--
-- Two metadata-only DDL ops → safe under load. Existing rows get
-- logoSource = NULL; the next sync cycle populates them via the resolver
-- + enrichment pipeline (no one-time backfill needed; sync is fast enough).

CREATE TYPE "LogoSource" AS ENUM ('override', 'logodev', 'spaces_cache', 'monogram', 'none');

ALTER TABLE "Company" ADD COLUMN "logoSource" "LogoSource";
