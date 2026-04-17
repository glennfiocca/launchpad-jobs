-- Add full-text search vector column to Job table
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

-- Backfill existing rows (title=A, company=B, department=C, content=D)
UPDATE "Job" j
SET "searchVector" = (
  setweight(to_tsvector('english', coalesce(j.title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(
    (SELECT name FROM "Company" WHERE id = j."companyId"), ''
  )), 'B') ||
  setweight(to_tsvector('english', coalesce(j.department, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(
    regexp_replace(coalesce(j.content, ''), '<[^>]+>', ' ', 'g'),
    ''
  )), 'D')
);

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS "Job_searchVector_idx" ON "Job" USING GIN ("searchVector");

-- Composite indexes for common filter combinations
CREATE INDEX IF NOT EXISTS "Job_isActive_remote_idx" ON "Job" ("isActive", "remote");
CREATE INDEX IF NOT EXISTS "Job_isActive_postedAt_idx" ON "Job" ("isActive", "postedAt" DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS "Job_isActive_employmentType_idx" ON "Job" ("isActive", "employmentType");
CREATE INDEX IF NOT EXISTS "Job_isActive_department_idx" ON "Job" ("isActive", "department");
CREATE INDEX IF NOT EXISTS "Job_isActive_companyId_idx" ON "Job" ("isActive", "companyId");

-- Partial index for salary range queries (only rows with salary data)
CREATE INDEX IF NOT EXISTS "Job_isActive_salary_idx"
  ON "Job" ("isActive", "salaryMin", "salaryMax")
  WHERE "salaryMin" IS NOT NULL;

-- Trigger function: maintain searchVector on every insert/update
CREATE OR REPLACE FUNCTION job_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(
      (SELECT name FROM "Company" WHERE id = NEW."companyId"), ''
    )), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.department, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(
      regexp_replace(coalesce(NEW.content, ''), '<[^>]+>', ' ', 'g'),
      ''
    )), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER job_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, department, content, "companyId"
ON "Job"
FOR EACH ROW EXECUTE FUNCTION job_search_vector_update();

-- When a Company name changes, re-trigger search vector update for all its jobs
CREATE OR REPLACE FUNCTION company_name_search_vector_update() RETURNS trigger AS $$
BEGIN
  -- Setting searchVector = searchVector forces the job trigger to re-fire for each row
  UPDATE "Job"
  SET "searchVector" = (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(department, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(
      regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g'),
      ''
    )), 'D')
  )
  WHERE "companyId" = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER company_name_search_trigger
AFTER UPDATE OF name ON "Company"
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION company_name_search_vector_update();
