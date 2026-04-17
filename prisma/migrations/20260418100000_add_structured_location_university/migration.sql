-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "ipedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "University_ipedId_key" ON "University"("ipedId");

-- CreateIndex
CREATE INDEX "University_name_idx" ON "University"("name");

-- AlterTable: add university FK and structured address fields to UserProfile
ALTER TABLE "UserProfile"
    ADD COLUMN "universityId" TEXT,
    ADD COLUMN "locationPlaceId" TEXT,
    ADD COLUMN "locationFormatted" TEXT,
    ADD COLUMN "locationStreet" TEXT,
    ADD COLUMN "locationCity" TEXT,
    ADD COLUMN "locationState" TEXT,
    ADD COLUMN "locationPostalCode" TEXT,
    ADD COLUMN "locationLat" DOUBLE PRECISION,
    ADD COLUMN "locationLng" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;
