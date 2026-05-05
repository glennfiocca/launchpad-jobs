/**
 * Curated canonical-name overrides.
 *
 * The resolver consults this map FIRST. If the slug matches, the value here
 * is treated as truth and overwrites whatever the ATS reported. This is the
 * escape hatch for names that the heuristic title-caser cannot reach
 * (truncations like "stronomer", brand-stylized casing like "OpenAI").
 *
 * Most canonical names live in SHARED_OVERRIDES — a brand's display name is
 * the same regardless of which ATS hosts the board. Provider-specific maps
 * exist for the rare case where the same token means different things in
 * different ATSes; provider-specific values win over shared values.
 *
 * Slug normalization for lookup:
 *   - GREENHOUSE: raw board token, lowercased
 *   - ASHBY:      "ashby-" prefix is stripped, lowercased
 */

import type { AtsProvider } from "@prisma/client";

/**
 * Brand canonicalization that applies regardless of ATS provider.
 * Keyed by the lowercased "bare" token (no provider prefix).
 */
const SHARED_OVERRIDES: Record<string, string> = {
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
  doordash: "DoorDash",
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
  elevenlabs: "ElevenLabs",
  langchain: "LangChain",
  coderabbit: "CodeRabbit",
  hockeystack: "HockeyStack",
  gptzero: "GPTZero",
  classdojo: "ClassDojo",
  clickup: "ClickUp",
  livekit: "LiveKit",
  motherduck: "MotherDuck",
  fullstory: "FullStory",
  posthog: "PostHog",
  lancedb: "LanceDB",
  webai: "WebAI",
  gigaml: "GigaML",
  signoz: "SigNoz",
  revenuecat: "RevenueCat",
  stackone: "StackOne",
  fleetworks: "FleetWorks",
  buildwithfern: "Fern",
  mazedesign: "Maze",
  stainlessapi: "Stainless",
  a16z: "a16z",
  sweetgreen: "sweetgreen",
  project44: "project44",
  dbt: "dbt",
  dbtlabsinc: "dbt Labs",

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

  // ".ai" / ".io" brands that appear without the suffix in the slug
  scaleai: "Scale AI",
  togetherai: "Together AI",
  snorkelai: "Snorkel AI",
  stabilityai: "Stability AI",
  arizeai: "Arize AI",
  bluefishai: "Bluefish AI",
  blackforestlabs: "Black Forest Labs",
  figureai: "Figure AI",
  furtherai: "Further AI",
  apolloio: "Apollo.io",
  grafanalabs: "Grafana Labs",
  cockroachlabs: "Cockroach Labs",
  ginkgobioworks: "Ginkgo Bioworks",
  abnormalsecurity: "Abnormal Security",
  orcasecurity: "Orca Security",
  sumologic: "Sumo Logic",
  newrelic: "New Relic",
  sigmacomputing: "Sigma Computing",
  launchdarkly: "LaunchDarkly",

  // Hyphenated Ashby tokens that resolve cleanly to spaced names
  "norm-ai": "Norm AI",
  "basis-ai": "Basis AI",
  "fiddler-ai": "Fiddler AI",
  "cogent-security": "Cogent Security",
  "talos-trading": "Talos Trading",
  "pylon-labs": "Pylon Labs",
  "rox-data-corp": "Rox Data Corp",
  "d-matrix": "d-Matrix",
};

const GREENHOUSE_OVERRIDES: Record<string, string> = {
  // Greenhouse-specific overrides go here. Most canonical names live in
  // SHARED_OVERRIDES. Use this map only when the same token must resolve
  // to a different name on Greenhouse vs Ashby (rare).
};

const ASHBY_OVERRIDES: Record<string, string> = {
  // Ashby-specific overrides go here. Empty for now — see SHARED_OVERRIDES.
};

/**
 * Look up a curated override for a given provider+slug pair.
 *
 * Provider-specific overrides win over shared overrides. The provider prefix
 * (e.g. "ashby-") is stripped before lookup.
 */
export function lookupOverride(
  provider: AtsProvider,
  slug: string,
): string | undefined {
  const key = stripProviderPrefix(provider, slug).toLowerCase();
  if (provider === "GREENHOUSE" && key in GREENHOUSE_OVERRIDES) {
    return GREENHOUSE_OVERRIDES[key];
  }
  if (provider === "ASHBY" && key in ASHBY_OVERRIDES) {
    return ASHBY_OVERRIDES[key];
  }
  return SHARED_OVERRIDES[key];
}

function stripProviderPrefix(provider: AtsProvider, slug: string): string {
  const prefix = `${provider.toLowerCase()}-`;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}

/**
 * Exposed for tests + admin tooling that want to inspect the full override set.
 */
export function allOverrides(): {
  shared: Readonly<Record<string, string>>;
  greenhouse: Readonly<Record<string, string>>;
  ashby: Readonly<Record<string, string>>;
} {
  return {
    shared: SHARED_OVERRIDES,
    greenhouse: GREENHOUSE_OVERRIDES,
    ashby: ASHBY_OVERRIDES,
  };
}
