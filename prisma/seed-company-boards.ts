import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// Read SEED_BOARDS from the sync module at runtime
// Run this script after migrating to populate CompanyBoard from hardcoded data
async function main() {
  // Dynamically import to avoid ts compilation issues
  const { SEED_BOARDS } = await import("../src/lib/greenhouse/sync")

  console.log(`Seeding ${SEED_BOARDS.length} company boards...`)
  let created = 0
  let updated = 0

  for (const board of SEED_BOARDS) {
    const result = await db.companyBoard.upsert({
      where: { boardToken: board.token },
      create: {
        name: board.name,
        boardToken: board.token,
        logoUrl: board.logoUrl ?? null,
        website: board.website ?? null,
      },
      update: {
        name: board.name,
        logoUrl: board.logoUrl ?? null,
        website: board.website ?? null,
      },
    })
    if (result.createdAt === result.updatedAt) created++
    else updated++
  }

  console.log(`✓ Created: ${created}, Updated: ${updated}`)
}

main().catch(console.error).finally(() => db.$disconnect())
