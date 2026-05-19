// scripts/deactivate-dead-boards.ts
// ONE-SHOT MAINTENANCE: Flip `isActive=false` on boards that consistently
// 404 upstream. Idempotent — safe to re-run.
//
// Usage:
//   # Dry-run (default): show what would change
//   npx tsx scripts/deactivate-dead-boards.ts
//
//   # Apply
//   npx tsx scripts/deactivate-dead-boards.ts --apply

import "dotenv/config";
import { db } from "../src/lib/db";

const DEAD_TOKENS: readonly string[] = ["coinbase", "hebbia", "lumos"];

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");

  const boards = await db.companyBoard.findMany({
    where: { boardToken: { in: [...DEAD_TOKENS] } },
    select: {
      id: true,
      name: true,
      boardToken: true,
      provider: true,
      isActive: true,
    },
  });

  console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);
  console.log(`Found ${boards.length} matching boards`);
  for (const b of boards) {
    console.log(
      `  ${b.provider} ${b.boardToken} (${b.name}) — isActive=${b.isActive}`
    );
  }

  if (!dryRun) {
    const r = await db.companyBoard.updateMany({
      where: { boardToken: { in: [...DEAD_TOKENS] } },
      data: { isActive: false },
    });
    console.log(`Deactivated ${r.count} boards.`);
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
