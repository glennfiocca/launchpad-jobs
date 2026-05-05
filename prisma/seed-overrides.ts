/**
 * Seed `CompanyLogoOverride` from the bundled TS map at
 * `src/lib/company-logo/overrides.ts`.
 *
 * Run on first deploy after the B.4 migration to bootstrap the existing
 * ~120 curated entries into the DB. Idempotent — re-running upserts with
 * `update: {}`, so admin edits made via the UI are NEVER overwritten.
 *
 * Invocation:
 *   npm run db:seed-overrides
 *
 * The TS map remains in tree as the canonical seed source. Editing the map
 * directly is fine for bulk pre-deploy adds; for ad-hoc runtime work, use
 * the /admin/logo-overrides UI.
 */

import { PrismaClient, type AtsProvider } from "@prisma/client";
import { allLogoOverrides, type LogoOverride } from "../src/lib/company-logo";

const db = new PrismaClient();

interface SeedRow {
  provider: AtsProvider;
  slug: string;
  override: LogoOverride;
}

function flattenOverrides(): SeedRow[] {
  const { shared, greenhouse, ashby } = allLogoOverrides();
  const rows: SeedRow[] = [];

  // Shared overrides apply to BOTH providers. Seed each as two rows so the
  // unique `(provider, slug)` index can be used for direct lookups without
  // a fallback "shared" row type. Mirrors the in-code behavior where a
  // provider-specific entry wins over the shared one — but at seed time
  // there's no provider-specific entry to clash with, so duplication is OK.
  for (const [slug, override] of Object.entries(shared)) {
    rows.push({ provider: "GREENHOUSE", slug, override });
    rows.push({ provider: "ASHBY", slug, override });
  }
  for (const [slug, override] of Object.entries(greenhouse)) {
    rows.push({ provider: "GREENHOUSE", slug, override });
  }
  for (const [slug, override] of Object.entries(ashby)) {
    rows.push({ provider: "ASHBY", slug, override });
  }

  return rows;
}

async function main(): Promise<void> {
  const rows = flattenOverrides();
  console.log(`Seeding ${rows.length} CompanyLogoOverride rows...`);

  let created = 0;
  let skipped = 0;

  for (const { provider, slug, override } of rows) {
    const result = await db.companyLogoOverride.upsert({
      where: { provider_slug: { provider, slug } },
      create: {
        provider,
        slug,
        website: override.website ?? null,
        logoUrl: override.logoUrl ?? null,
        notes: "seeded from src/lib/company-logo/overrides.ts",
      },
      // CRITICAL: empty update body — never overwrite admin edits on re-seed.
      update: {},
    });
    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`Created: ${created}, Skipped (already exists): ${skipped}`);
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
