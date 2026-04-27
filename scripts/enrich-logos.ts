import "dotenv/config";
import { db } from "../src/lib/db";
import { enrichCompanyLogo } from "../src/lib/logo-enrichment";

async function main(): Promise<void> {
  const companies = await db.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, website: true },
  });

  console.log(`Found ${companies.length} companies without a logo URL.`);

  let enriched = 0;
  let failedOrSkipped = 0;

  for (const company of companies) {
    const cdnUrl = await enrichCompanyLogo(company);

    if (cdnUrl) {
      console.log(`  success  ${company.name} — ${cdnUrl}`);
      enriched++;
    } else {
      console.log(`  skip/fail  ${company.name} (${company.website ?? "no website"})`);
      failedOrSkipped++;
    }
  }

  console.log(`\nDone: ${enriched} enriched, ${failedOrSkipped} failed/skipped`);

  await db.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
