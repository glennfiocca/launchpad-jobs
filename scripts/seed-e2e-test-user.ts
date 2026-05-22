/**
 * Seed the canonical E2E test user used by Playwright.
 *
 * Re-runnable / idempotent — uses Prisma upsert so it's safe against an
 * already-seeded DB and works against either local dev or prod (DATABASE_URL
 * decides which).
 *
 * Run via:
 *   npx tsx scripts/seed-e2e-test-user.ts
 *
 * Fixture spec (kept in sync with CLAUDE.md):
 *   - User: e2e-test@trypipeline.ai, role USER, name "E2E Test User"
 *   - UserProfile: partial fill (firstName/lastName + SF/CA + 1 social,
 *     2 application templates left empty so blur-to-save has something to flip)
 *   - 2 WorkExperiences (Stripe current + Affirm past) → spine timeline + reorder
 *   - 3 Skills across 3 proficiency tiers (5★ / 4★ / 2★) → tier grid
 *   - 0 EducationEntry / Project / Certification / Resume on purpose — empty
 *     axes exercise the sigil's perimeter hit-area + the "invite to fill"
 *     tooltip copy.
 */
import { db } from "../src/lib/db";

const USER_ID = "cmpe2etest0000glenneeeeeee";
const PROFILE_ID = "cmpe2etestprof0000glenneeeee";
const EMAIL = "e2e-test@trypipeline.ai";

async function main(): Promise<void> {
  await db.user.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      email: EMAIL,
      emailVerified: new Date(),
      name: "E2E Test User",
    },
    update: {},
  });

  await db.userProfile.upsert({
    where: { id: PROFILE_ID },
    create: {
      id: PROFILE_ID,
      userId: USER_ID,
      firstName: "E2E",
      lastName: "Test",
      email: EMAIL,
      phone: "+15555550100",
      locationCity: "San Francisco",
      locationState: "CA",
      linkedinUrl: "https://linkedin.com/in/e2e-test",
      githubUrl: "https://github.com/e2e-test",
      currentTitle: "Senior Software Engineer",
      summary: "Test user for automated UI verification.",
      yearsExperience: 5,
      targetRoles: ["software engineer", "staff engineer"],
      desiredEmploymentTypes: ["full-time"],
      openToRemote: true,
      openToHybrid: true,
      openToOnsite: false,
    },
    update: {},
  });

  await db.workExperience.upsert({
    where: { id: "cmpe2ework0001" },
    create: {
      id: "cmpe2ework0001",
      profileId: PROFILE_ID,
      title: "Senior Software Engineer",
      company: "Stripe",
      startDate: new Date("2022-01-01"),
      endDate: null,
      isCurrent: true,
      employmentType: "full-time",
      description: "Connect onboarding redesign.",
      order: 0,
    },
    update: {},
  });

  await db.workExperience.upsert({
    where: { id: "cmpe2ework0002" },
    create: {
      id: "cmpe2ework0002",
      profileId: PROFILE_ID,
      title: "Software Engineer",
      company: "Affirm",
      startDate: new Date("2020-01-01"),
      endDate: new Date("2021-12-31"),
      isCurrent: false,
      employmentType: "full-time",
      description: "Built merchant servicing platform.",
      order: 1,
    },
    update: {},
  });

  const skills: ReadonlyArray<{ id: string; name: string; category: string; proficiency: number; yearsUsed: number; order: number }> = [
    { id: "cmpe2eskill0001", name: "TypeScript", category: "language", proficiency: 5, yearsUsed: 6, order: 0 },
    { id: "cmpe2eskill0002", name: "React", category: "framework", proficiency: 4, yearsUsed: 5, order: 1 },
    { id: "cmpe2eskill0003", name: "Rust", category: "language", proficiency: 2, yearsUsed: 1, order: 2 },
  ];
  for (const s of skills) {
    await db.skill.upsert({
      where: { id: s.id },
      create: { ...s, profileId: PROFILE_ID },
      update: {},
    });
  }

  console.log(`[seed] e2e test user ready: ${EMAIL} (User.id=${USER_ID}, UserProfile.id=${PROFILE_ID})`);
  console.log("[seed] 2 work experiences + 3 skills across tiers 5/4/2 seeded");

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
