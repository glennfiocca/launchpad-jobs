/**
 * Curated canonical-name overrides keyed by `(provider, slug)`.
 *
 * The resolver consults this map FIRST. If the slug matches, the value here
 * is treated as truth and overwrites whatever the ATS reported. This is the
 * escape hatch for names that the heuristic title-caser cannot reach
 * (truncations like "stronomer", brand-stylized casing like "OpenAI").
 *
 * Slug format:
 *   - GREENHOUSE: the raw board token (e.g. "openai", "doordashusa")
 *   - ASHBY:      "ashby-{boardToken}"
 *
 * Add new entries any time a sync surfaces a malformed name.
 */

import type { AtsProvider } from "@prisma/client";

const GREENHOUSE_OVERRIDES: Record<string, string> = {
  // Brand-stylized casing
  openai: "OpenAI",
  anthropic: "Anthropic",
  hashicorp: "HashiCorp",
  mongodb: "MongoDB",
  applovin: "AppLovin",
  avepoint: "AvePoint",
  audioeye: "AudioEye",
  coreweave: "CoreWeave",
  cargurus: "CarGurus",
  buzzfeed: "BuzzFeed",
  hellofresh: "HelloFresh",
  doordashusa: "DoorDash",
  godaddy: "GoDaddy",
  costar: "CoStar",
  verisign: "VeriSign",
  spacex: "SpaceX",
  abcellera: "AbCellera",
  bridgebio: "BridgeBio",
  caredxinc: "CareDx",
  billiontoone: "BillionToOne",
  "1stdibscom": "1stDibs",
  alarmcom: "Alarm.com",
  airsculpt: "AirSculpt",
  realpha: "reAlpha",

  // Truncations + obvious typos seen in the wild
  astronomer: "Astronomer",
  stronomer: "Astronomer",

  // Tokens that map to a different brand name
  block: "Block",
  couchbaseinc: "Couchbase",
  bottomlinetechnologies: "Bottomline Technologies",
  vianttechnology: "Viant Technology",
  corescientific: "Core Scientific",
  riotgames: "Riot Games",
  clear: "CLEAR",
  optoinvest: "Opto Invest",
  proshares: "ProShares",
  bitcoindepot: "Bitcoin Depot",
  align: "Align Technology",
  eqtcorporation: "EQT Corporation",
  lucidmotors: "Lucid Motors",
  andurilindustries: "Anduril Industries",
  appliedintuition: "Applied Intuition",
  aurorainnovation: "Aurora Innovation",
  archer: "Archer Aviation",
  astspacemobile: "AST SpaceMobile",
  axiom: "Axiom Space",
  asteralabs: "Astera Labs",
  acadiapharmaceuticals: "Acadia Pharmaceuticals",
  adaptivebiotechnologies: "Adaptive Biotechnologies",
  apogeetherapeutics: "Apogee Therapeutics",
  axsometherapeutics: "Axsome Therapeutics",
  avalotherapeutics: "Avalo Therapeutics",
  beamtherapeutics: "Beam Therapeutics",
  cariboubiosciencesinc: "Caribou Biosciences",
  cogentbiosciences: "Cogent Biosciences",
  compasspathways: "Compass Pathways",
  compasstherapeutics: "Compass Therapeutics",
  corcepttherapeutics: "Corcept Therapeutics",
  dayonebiopharmaceuticals: "Day One Biopharmaceuticals",
  definiumtherapeutics: "Definium Therapeutics",
  dianthustherapeutics: "Dianthus Therapeutics",
  dynetherapeutics: "Dyne Therapeutics",
  cloverhealth: "Clover Health",
  lakefieldveterinarygroup: "Lakefield Veterinary Group",
  assetliving: "Asset Living",
  fox: "Fox Corporation",
  genuine: "Genuine Parts",
  beyond: "Beyond Meat",
  bluemoonmetals: "Blue Moon Metals",
  ess: "ESS Tech",
  yld: "YLD",
  ww: "Weight Watchers",

  // Common ".ai" / ".io" brands surfacing as lowercase
  scaleai: "Scale AI",
  togetherai: "Together AI",
  snorkelai: "Snorkel AI",
  stabilityai: "Stability AI",
  arizeai: "Arize AI",
  bluefishai: "Bluefish AI",
  blackforestlabs: "Black Forest Labs",
  figureai: "Figure AI",
  apolloio: "Apollo.io",
  grafanalabs: "Grafana Labs",
  cockroachlabs: "Cockroach Labs",
  ginkgobioworks: "Ginkgo Bioworks",
  abnormalsecurity: "Abnormal Security",
  orcasecurity: "Orca Security",
  sumologic: "Sumo Logic",
  newrelic: "New Relic",
  sigmacomputing: "Sigma Computing",
  dbtlabsinc: "dbt Labs",
  launchdarkly: "LaunchDarkly",
};

const ASHBY_OVERRIDES: Record<string, string> = {
  // Add Ashby-specific overrides here as we discover them.
  // Keys are raw board tokens (without the "ashby-" prefix).
};

/**
 * Look up a curated override for a given provider+slug pair.
 *
 * @param provider  AtsProvider enum value
 * @param slug      The slug stored on Company (board token for GH; "ashby-{token}" for Ashby)
 * @returns         The canonical name, or undefined if no override exists
 */
export function lookupOverride(
  provider: AtsProvider,
  slug: string,
): string | undefined {
  const key = stripProviderPrefix(provider, slug).toLowerCase();
  if (provider === "GREENHOUSE") return GREENHOUSE_OVERRIDES[key];
  if (provider === "ASHBY") return ASHBY_OVERRIDES[key];
  return undefined;
}

function stripProviderPrefix(provider: AtsProvider, slug: string): string {
  const prefix = `${provider.toLowerCase()}-`;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}

/**
 * Exposed for tests + admin tooling that want to inspect the full override set.
 */
export function allOverrides(): {
  greenhouse: Readonly<Record<string, string>>;
  ashby: Readonly<Record<string, string>>;
} {
  return { greenhouse: GREENHOUSE_OVERRIDES, ashby: ASHBY_OVERRIDES };
}
