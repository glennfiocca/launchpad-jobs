-- CreateEnum
CREATE TYPE "AtsProvider" AS ENUM ('GREENHOUSE', 'ASHBY');

-- AlterTable: CompanyBoard
ALTER TABLE "CompanyBoard" ADD COLUMN "provider" "AtsProvider" NOT NULL DEFAULT 'GREENHOUSE';

-- AlterTable: Company
ALTER TABLE "Company" ADD COLUMN "provider" "AtsProvider" NOT NULL DEFAULT 'GREENHOUSE';

-- AlterTable: Job
ALTER TABLE "Job" ADD COLUMN "provider" "AtsProvider" NOT NULL DEFAULT 'GREENHOUSE';
