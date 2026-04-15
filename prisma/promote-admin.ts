import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error("Usage: npx tsx prisma/promote-admin.ts <email>")
    process.exit(1)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user) {
    console.error(`No user found with email: ${email}`)
    process.exit(1)
  }

  const updated = await db.user.update({
    where: { email },
    data: { role: "ADMIN" },
  })
  console.log(`✓ Promoted ${updated.email} to ADMIN (id: ${updated.id})`)
}

main().catch(console.error).finally(() => db.$disconnect())
