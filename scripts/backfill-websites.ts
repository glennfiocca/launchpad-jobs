/**
 * Backfills missing Company.website values by trying common domain patterns
 * derived from the company's board token / name, then re-runs logo enrichment
 * for companies that were updated.
 *
 * Usage: npx tsx scripts/backfill-websites.ts
 */

import "dotenv/config"
import { db } from "../src/lib/db"
import { enrichCompanyLogo } from "../src/lib/logo-enrichment"

/** Known token -> domain overrides for non-obvious mappings */
const DOMAIN_OVERRIDES: Record<string, string> = {
  doordashusa: "doordash.com",
  couchbaseinc: "couchbase.com",
  bottomlinetechnologies: "bottomline.com",
  alarmcom: "alarm.com",
  "1stdibscom": "1stdibs.com",
  vianttechnology: "viant.com",
  corescientific: "corescientific.com",
  andurilindustries: "anduril.com",
  appliedintuition: "appliedintuition.com",
  astspacemobile: "ast-science.com",
  asteralabs: "asteralabs.com",
  lucidmotors: "lucidmotors.com",
  aurorainnovation: "aurora.tech",
  acadiapharmaceuticals: "acadia.com",
  adaptivebiotechnologies: "adaptivebiotech.com",
  apogeetherapeutics: "apogeetherapeutics.com",
  axsometherapeutics: "axsome.com",
  avalotherapeutics: "avalotx.com",
  beamtherapeutics: "beamtx.com",
  billiontoone: "billiontoone.com",
  bridgebio: "bridgebio.com",
  caredxinc: "caredx.com",
  cariboubiosciencesinc: "cariboubio.com",
  cogentbiosciences: "cogentbio.com",
  compasspathways: "compasspathways.com",
  compasstherapeutics: "compasstherapeutics.com",
  corcepttherapeutics: "corcept.com",
  dayonebiopharmaceuticals: "dayonebio.com",
  definiumtherapeutics: "definiumtx.com",
  dianthustherapeutics: "dianthustx.com",
  dynetherapeutics: "dynetx.com",
  lakefieldveterinarygroup: "lakefieldvet.com",
  cloverhealth: "cloverhealth.com",
  epicgames: "epicgames.com",
  riotgames: "riotgames.com",
  abnormalsecurity: "abnormalsecurity.com",
  orcasecurity: "orca.security",
  cockroachlabs: "cockroachlabs.com",
  ginkgobioworks: "ginkgobioworks.com",
  scaleai: "scale.com",
  togetherai: "together.ai",
  snorkelai: "snorkel.ai",
  stabilityai: "stability.ai",
  arizeai: "arize.com",
  bluefishai: "bluefish.ai",
  blackforestlabs: "blackforestlabs.ai",
  grafanalabs: "grafana.com",
  sumologic: "sumologic.com",
  newrelic: "newrelic.com",
  sigmacomputing: "sigmacomputing.com",
  dbtlabsinc: "getdbt.com",
  launchdarkly: "launchdarkly.com",
  telnyx54: "telnyx.com",
  lucidsoftware: "lucid.co",
  samsungsemiconductor: "samsung.com",
  samsungresearchamericainternship: "samsung.com",
  paveakatroveinformationtechnologies: "pave.com",
  acrisureinnovation: "acrisure.com",
  fiveringsllc: "fiverings.com",
  colabsoftware: "colabsoftware.com",
  radixuniversity: "radixtrading.co",
  aquaticcapitalmanagement: "aquaticcapital.com",
  bridgewater89: "bridgewater.com",
  day1academies: "bezosacademy.org",
  elitetechnology: "elitetech.com",
  chanzuckerberginitiative: "chanzuckerberg.com",
  drweng: "drw.com",
  ibkr: "interactivebrokers.com",
  figureai: "figure.ai",
  christfellowship: "christfellowship.church",
  vaynermedia: "vaynermedia.com",
  razorpaysoftwareprivatelimited: "razorpay.com",
  stubhubinc: "stubhub.com",
  addepar1: "addepar.com",
  layerzerolabs: "layerzero.network",
  locusrobotics: "locusrobotics.com",
  arcadiacareers: "arcadia.com",
  virbiotechnologyinc: "vir.bio",
  zupinnovation: "zup.com.br",
  ww: "weightwatchers.com",
  taketwo: "take2games.com",
  goatgroup: "goat.com",
  apolloio: "apollo.io",
}

/**
 * Try to derive a website URL from a board token.
 * Returns null if we can't confidently guess.
 */
function guessWebsite(token: string, name: string): string | null {
  // Check overrides first
  if (DOMAIN_OVERRIDES[token]) {
    return `https://www.${DOMAIN_OVERRIDES[token]}`
  }

  // Skip generic tokens
  const skipTokens = new Set(["global", "us", "remote", "general", "international", "loop", "flex", "make"])
  if (skipTokens.has(token)) return null

  // Try token as domain directly (most common pattern)
  // Clean up: remove trailing numbers, "inc", "careers", etc.
  const cleaned = token
    .replace(/\d+$/, "")
    .replace(/careers$/, "")
    .replace(/inc$/, "")
    .replace(/jobs$/, "")
    .replace(/llc$/, "")

  if (cleaned.length >= 3) {
    return `https://www.${cleaned}.com`
  }

  return null
}

async function verifyWebsite(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaunchpadBot/1.0)" },
    })
    clearTimeout(timeout)
    return res.ok || res.status === 403 || res.status === 405
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  // Find companies with no website and no logo
  const companies = await db.company.findMany({
    where: { website: null },
    select: { id: true, name: true, slug: true, logoUrl: true },
  })

  console.log(`Found ${companies.length} companies without a website.`)

  let websitesSet = 0
  let logosEnriched = 0
  let failed = 0

  for (const company of companies) {
    const guessed = guessWebsite(company.slug, company.name)
    if (!guessed) {
      console.log(`  skip    ${company.name} (${company.slug}) — no guess`)
      failed++
      continue
    }

    const valid = await verifyWebsite(guessed)
    if (!valid) {
      console.log(`  invalid ${company.name} — ${guessed}`)
      failed++
      continue
    }

    // Update the company with the website
    await db.company.update({
      where: { id: company.id },
      data: { website: guessed },
    })
    websitesSet++
    console.log(`  website ${company.name} — ${guessed}`)

    // Now try logo enrichment if no logo yet
    if (!company.logoUrl) {
      const logoUrl = await enrichCompanyLogo({
        id: company.id,
        website: guessed,
        name: company.name,
      })
      if (logoUrl) {
        logosEnriched++
        console.log(`  logo    ${company.name} — ${logoUrl}`)
      }
    }
  }

  console.log(`\nDone: ${websitesSet} websites set, ${logosEnriched} logos enriched, ${failed} skipped/failed`)
  await db.$disconnect()
}

main().catch((err: unknown) => {
  console.error("Fatal:", err)
  process.exit(1)
})
