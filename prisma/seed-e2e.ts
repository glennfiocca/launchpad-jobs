/**
 * E2E test database seed.
 *
 * This script is for end-to-end tests ONLY. It is intentionally separate from
 * `prisma/seed-company-boards.ts` and `prisma/seed-universities.ts` (which
 * populate production-shaped reference data) because:
 *
 *   1. The fixture data here is deterministic — IDs, slugs, and emails are
 *      stable strings so Playwright tests can hardcode them.
 *   2. It seeds *test users* with `@trypipeline.ai` `e2e-` prefixed emails
 *      that the test-only sign-in endpoint accepts. Mixing this with the
 *      regular seed would risk these accounts shipping to production.
 *   3. It is fully idempotent — every write is an upsert, so the script is
 *      safe to re-run on a fresh DB or one that has been seeded before.
 *
 * Usage:
 *   npm run db:seed:e2e
 *
 * Fixtures created:
 *   - 1 Company:     "E2E Test Company" (slug "e2e-testco", GREENHOUSE)
 *   - 5 Jobs:        publicJobId PLE2E0000001..PLE2E0000005, varied filters
 *   - 1 User+Profile: e2e-test@trypipeline.ai (complete profile + dummy resume)
 *   - 1 User only:    e2e-empty@trypipeline.ai (no profile — for "incomplete"
 *                     UI states)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// --- Deterministic constants — tests can hardcode these. ---

const COMPANY_SLUG = "e2e-testco";
const COMPANY_NAME = "E2E Test Company";

const VALIDITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Tiny dummy PDF — magic bytes + EOF marker. Enough for "is a PDF" checks
// without bloating the test DB.
const DUMMY_PDF_BYTES = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // %PDF-1.4\n
  0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,                   // binary marker
  0x25, 0x25, 0x45, 0x4f, 0x46, 0x0a,                   // %%EOF\n
]);

interface JobFixture {
  publicJobId: string;
  externalId: string;
  title: string;
  department: string;
  location: string;
  remote: boolean;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
}

const JOB_FIXTURES: ReadonlyArray<JobFixture> = [
  {
    publicJobId: "PLE2E0000001",
    externalId: "PLE2E0000001",
    title: "Senior Backend Engineer",
    department: "Engineering",
    location: "Remote",
    remote: true,
    employmentType: "FULL_TIME",
    salaryMin: 150000,
    salaryMax: 220000,
  },
  {
    publicJobId: "PLE2E0000002",
    externalId: "PLE2E0000002",
    title: "Product Designer",
    department: "Design",
    location: "San Francisco, CA",
    remote: false,
    employmentType: "FULL_TIME",
  },
  {
    publicJobId: "PLE2E0000003",
    externalId: "PLE2E0000003",
    title: "Marketing Intern",
    department: "Marketing",
    location: "New York, NY",
    remote: false,
    employmentType: "INTERN",
  },
  {
    publicJobId: "PLE2E0000004",
    externalId: "PLE2E0000004",
    title: "Senior Engineer",
    department: "Engineering",
    location: "Austin, TX",
    remote: false,
    employmentType: "FULL_TIME",
    salaryMin: 180000,
    salaryMax: 240000,
  },
  {
    publicJobId: "PLE2E0000005",
    externalId: "PLE2E0000005",
    title: "Customer Success Manager",
    department: "Customer Success",
    location: "Remote",
    remote: true,
    employmentType: "FULL_TIME",
  },
];

const JOB_CONTENT_HTML = "<p>This is a test job description.</p>";

// --- Seed steps ---

async function seedCompany(): Promise<{ id: string }> {
  return db.company.upsert({
    where: {
      provider_slug: { provider: "GREENHOUSE", slug: COMPANY_SLUG },
    },
    create: {
      name: COMPANY_NAME,
      slug: COMPANY_SLUG,
      provider: "GREENHOUSE",
      logoUrl: null,
      website: "https://example.com",
    },
    update: {
      name: COMPANY_NAME,
      website: "https://example.com",
    },
    select: { id: true },
  });
}

async function seedJobs(companyId: string): Promise<void> {
  const now = new Date();
  const validThrough = new Date(now.getTime() + VALIDITY_WINDOW_MS);

  for (const fixture of JOB_FIXTURES) {
    await db.job.upsert({
      where: { publicJobId: fixture.publicJobId },
      create: {
        publicJobId: fixture.publicJobId,
        externalId: fixture.externalId,
        companyId,
        provider: "GREENHOUSE",
        title: fixture.title,
        department: fixture.department,
        location: fixture.location,
        remote: fixture.remote,
        employmentType: fixture.employmentType,
        boardToken: COMPANY_SLUG,
        absoluteUrl: null,
        content: JOB_CONTENT_HTML,
        salaryMin: fixture.salaryMin ?? null,
        salaryMax: fixture.salaryMax ?? null,
        salaryCurrency: fixture.salaryMin != null ? "USD" : null,
        isActive: true,
        postedAt: now,
        validThrough,
      },
      update: {
        title: fixture.title,
        department: fixture.department,
        location: fixture.location,
        remote: fixture.remote,
        employmentType: fixture.employmentType,
        content: JOB_CONTENT_HTML,
        salaryMin: fixture.salaryMin ?? null,
        salaryMax: fixture.salaryMax ?? null,
        salaryCurrency: fixture.salaryMin != null ? "USD" : null,
        isActive: true,
        postedAt: now,
        validThrough,
      },
    });
  }
}

async function seedCompleteUser(): Promise<void> {
  const email = "e2e-test@trypipeline.ai";

  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name: "E2E Test User",
      role: "USER",
    },
    update: {
      name: "E2E Test User",
      role: "USER",
    },
    select: { id: true },
  });

  await db.userProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      firstName: "E2E",
      lastName: "Test",
      email,
      phone: "+1 (555) 555-0100",
      location: "San Francisco, CA",
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      resumeData: DUMMY_PDF_BYTES,
      resumeFileName: "test-resume.pdf",
      resumeMimeType: "application/pdf",
      isComplete: true,
    },
    update: {
      firstName: "E2E",
      lastName: "Test",
      email,
      phone: "+1 (555) 555-0100",
      location: "San Francisco, CA",
      linkedinUrl: null,
      githubUrl: null,
      portfolioUrl: null,
      resumeData: DUMMY_PDF_BYTES,
      resumeFileName: "test-resume.pdf",
      resumeMimeType: "application/pdf",
      isComplete: true,
    },
  });
}

async function seedEmptyUser(): Promise<void> {
  const email = "e2e-empty@trypipeline.ai";

  await db.user.upsert({
    where: { email },
    create: {
      email,
      name: null,
      role: "USER",
    },
    update: {
      // Intentionally do not set a name — the "empty" fixture exists to
      // exercise the missing-profile UI branch.
      name: null,
      role: "USER",
    },
  });
}

async function main(): Promise<void> {
  console.log("[seed-e2e] starting...");

  const company = await seedCompany();
  console.log(`[seed-e2e] company: ${COMPANY_SLUG} (${company.id})`);

  await seedJobs(company.id);
  console.log(`[seed-e2e] jobs: ${JOB_FIXTURES.length}`);

  await seedCompleteUser();
  console.log("[seed-e2e] user: e2e-test@trypipeline.ai (complete profile)");

  await seedEmptyUser();
  console.log("[seed-e2e] user: e2e-empty@trypipeline.ai (no profile)");

  console.log("[seed-e2e] done.");
}

main()
  .catch((err: unknown) => {
    console.error("[seed-e2e] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
