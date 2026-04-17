import { PrismaClient } from "@prisma/client"
import universities from "./data/universities.json"

const db = new PrismaClient()

interface UniversityRecord {
  ipedId: string
  name: string
  city?: string
  state?: string
}

async function main() {
  const records = universities as UniversityRecord[]
  // Deduplicate by ipedId (JSON may have duplicates from authoring)
  const seen = new Set<string>()
  const unique = records.filter((u) => {
    if (seen.has(u.ipedId)) return false
    seen.add(u.ipedId)
    return true
  })

  console.log(`Seeding ${unique.length} universities...`)
  let upserted = 0

  for (const u of unique) {
    await db.university.upsert({
      where: { ipedId: u.ipedId },
      create: {
        ipedId: u.ipedId,
        name: u.name,
        city: u.city ?? null,
        state: u.state ?? null,
      },
      update: {
        name: u.name,
        city: u.city ?? null,
        state: u.state ?? null,
      },
    })
    upserted++
  }

  console.log(`✓ Upserted: ${upserted} universities`)
}

main().catch(console.error).finally(() => db.$disconnect())
