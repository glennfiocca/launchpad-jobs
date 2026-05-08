-- Profile expansion (Phase 1) — schema-only changes, all additive.
--
-- 1) Adds new optional / defaulted columns to UserProfile (extended social
--    links, job-search preferences, compliance, application templates).
--    Every column is either nullable or has a default → metadata-only ALTER,
--    safe under load.
--
-- 2) Creates 6 new child tables hanging off UserProfile (Skill,
--    WorkExperience, EducationEntry, Project, Certification, SpokenLanguage)
--    with cascade-on-delete from the profile. EducationEntry also FKs to
--    University with ON DELETE SET NULL.
--
-- Enum-like fields are stored as TEXT (with app-side validation via the
-- shared union types in src/types/_shared/profile-enums.ts) to keep the DB
-- migration footprint flat — matches the existing project convention for
-- soft enums (see UserProfile.workAuthorization, Job.workMode, etc.).

-- AlterTable: extended professional / social links
ALTER TABLE "UserProfile" ADD COLUMN "twitterUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "stackOverflowUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "dribbbleUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "behanceUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "mediumUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "devToUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "googleScholarUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "huggingFaceUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "kaggleUrl" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "youtubeUrl" TEXT;

-- AlterTable: job-search preferences
ALTER TABLE "UserProfile" ADD COLUMN "noticePeriodWeeks" INTEGER;
ALTER TABLE "UserProfile" ADD COLUMN "earliestStartDate" TIMESTAMP(3);
ALTER TABLE "UserProfile" ADD COLUMN "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "targetIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "companySizePreferences" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "relocationOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserProfile" ADD COLUMN "relocationCities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "currencyPreference" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "UserProfile" ADD COLUMN "equityImportance" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "desiredEmploymentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserProfile" ADD COLUMN "searchStatus" TEXT NOT NULL DEFAULT 'open';

-- AlterTable: compliance (standard ATS questions, none are PII)
ALTER TABLE "UserProfile" ADD COLUMN "hasDriversLicense" BOOLEAN;
ALTER TABLE "UserProfile" ADD COLUMN "willingBackgroundCheck" BOOLEAN;
ALTER TABLE "UserProfile" ADD COLUMN "willingDrugTest" BOOLEAN;
ALTER TABLE "UserProfile" ADD COLUMN "securityClearance" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "UserProfile" ADD COLUMN "eligibleCountries" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: application templates
ALTER TABLE "UserProfile" ADD COLUMN "coverLetterIntro" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "whyImLookingTemplate" TEXT;

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "proficiency" INTEGER NOT NULL,
    "yearsUsed" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkExperience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyUrl" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "employmentType" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EducationEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "universityId" TEXT,
    "schoolName" TEXT,
    "degree" TEXT NOT NULL,
    "fieldOfStudy" TEXT NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "gpa" DOUBLE PRECISION,
    "honors" TEXT,
    "activities" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EducationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "repoUrl" TEXT,
    "description" TEXT,
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isOngoing" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "credentialUrl" TEXT,
    "credentialId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpokenLanguage" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "proficiency" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpokenLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_profileId_name_key" ON "Skill"("profileId", "name");

-- CreateIndex
CREATE INDEX "Skill_profileId_idx" ON "Skill"("profileId");

-- CreateIndex
CREATE INDEX "WorkExperience_profileId_idx" ON "WorkExperience"("profileId");

-- CreateIndex
CREATE INDEX "WorkExperience_profileId_startDate_idx" ON "WorkExperience"("profileId", "startDate");

-- CreateIndex
CREATE INDEX "EducationEntry_profileId_idx" ON "EducationEntry"("profileId");

-- CreateIndex
CREATE INDEX "Project_profileId_idx" ON "Project"("profileId");

-- CreateIndex
CREATE INDEX "Certification_profileId_idx" ON "Certification"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "SpokenLanguage_profileId_name_key" ON "SpokenLanguage"("profileId", "name");

-- CreateIndex
CREATE INDEX "SpokenLanguage_profileId_idx" ON "SpokenLanguage"("profileId");

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkExperience" ADD CONSTRAINT "WorkExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducationEntry" ADD CONSTRAINT "EducationEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EducationEntry" ADD CONSTRAINT "EducationEntry_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpokenLanguage" ADD CONSTRAINT "SpokenLanguage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
