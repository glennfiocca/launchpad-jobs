-- Truncate Job FTS inputs to 500 KB before tsvectorizing.
--
-- Postgres `tsvector` has a hard 1 MB (1048575 bytes) per-document limit.
-- Some Greenhouse job descriptions are 1.5–4.6 MB after HTML stripping
-- (KnowBe4, Pathward, etc.) and rejected the entire INSERT/UPDATE with:
--   "string is too long for tsvector (X bytes, max 1048575 bytes)"
--
-- 500 KB is well under the limit and preserves the first ~500K characters,
-- which carries every useful search keyword for any realistic job posting.
-- Deeper content (employee benefits boilerplate, legal disclaimers, etc.)
-- rarely changes search relevance.
--
-- This recreates both trigger functions with LEFT(..., 500000) wrapping
-- the content input. Title / department / company name aren't wrapped —
-- those are bounded in practice (<1 KB). No data backfill needed: the
-- failed rows from prior syncs were never written; the next sync retries
-- them and the trigger now accepts the truncated value.

CREATE OR REPLACE FUNCTION job_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(
      (SELECT name FROM "Company" WHERE id = NEW."companyId"), ''
    )), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.department, '')), 'C') ||
    setweight(to_tsvector('english', LEFT(coalesce(
      regexp_replace(coalesce(NEW.content, ''), '<[^>]+>', ' ', 'g'),
      ''
    ), 500000)), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION company_name_search_vector_update() RETURNS trigger AS $$
BEGIN
  UPDATE "Job"
  SET "searchVector" = (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(department, '')), 'C') ||
    setweight(to_tsvector('english', LEFT(coalesce(
      regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g'),
      ''
    ), 500000)), 'D')
  )
  WHERE "companyId" = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
