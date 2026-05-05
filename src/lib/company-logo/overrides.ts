/**
 * Curated website + logo overrides keyed by `(provider, slug)`.
 *
 * NOTE: This map is now a deploy-time SEED for the CompanyLogoOverride DB
 * table. Runtime source of truth is the DB. To bootstrap a fresh deploy:
 *   npm run db:seed-overrides
 * Editing this file manually is OK only as a way to add bulk new entries
 * before a deploy. For ad-hoc admin work, use /admin/logo-overrides UI.
 *
 * The resolver consults `lookupLogoOverride()` FIRST. If a slug matches, the
 * override wins over both ATS-supplied metadata and the heuristic
 * domain-guessing path. This is the escape hatch for cases where the
 * heuristic gets it wrong — most commonly companies whose `.com` is squatted
 * or owned by a different brand (e.g. Astronomer, whose real domain is
 * astronomer.io).
 *
 * Three layers of resolution sit on top:
 *   1. CompanyBoard.website / CompanyBoard.logoUrl  ← admin per-row UI
 *   2. CompanyLogoOverride DB row + this map        ← curated truth
 *   3. Greenhouse `board.website` / `board.logo`    ← ATS-reported
 *   4. Heuristic multi-TLD probe                    ← last resort
 */

import type { AtsProvider } from "@prisma/client";
import { db } from "@/lib/db";

export interface LogoOverride {
  /** Canonical company website (used as input to the logo lookup). */
  website?: string;
  /**
   * Direct logo URL to fetch + cache. Used when the default bare logo.dev
   * URL still doesn't render well for this specific brand and an admin has
   * curated a better variant manually (typically a hand-picked logo.dev
   * URL with custom params, or a non-logo.dev hosted asset).
   */
  logoUrl?: string;
}

/**
 * Brand-truth overrides that apply across providers. Most entries live here
 * because a brand's domain is the same regardless of which ATS hosts the
 * board.
 */
const SHARED_OVERRIDES: Record<string, LogoOverride> = {
  // Non-`.com` startups whose `.com` is owned by a different brand.
  // Astronomer + Okta use admin-supplied logo URLs (logo.dev's default
  // JPEG variant) because their theme=dark/light variants both render
  // poorly on our dark surface — the JPEG has a real white background
  // baked into the pixels, which pops cleanly on #0a0a0a.
  astronomer: {
    website: "https://astronomer.io",
    logoUrl: "https://img.logo.dev/astronomer.io?token=pk_OEBqO-UTREKseni15wZ-qg&retina=true",
  },
  stronomer: {
    website: "https://astronomer.io",
    logoUrl: "https://img.logo.dev/astronomer.io?token=pk_OEBqO-UTREKseni15wZ-qg&retina=true",
  },
  okta: {
    website: "https://www.okta.com",
    logoUrl: "https://img.logo.dev/okta.com?token=pk_OEBqO-UTREKseni15wZ-qg&retina=true",
  },
  instructure: {
    website: "https://www.instructure.com",
    logoUrl: "https://img.logo.dev/instructure.com?token=pk_OEBqO-UTREKseni15wZ-qg&retina=true",
  },
  rain: {
    website: "https://rain.xyz",
    logoUrl: "https://img.logo.dev/rain.xyz?token=pk_OEBqO-UTREKseni15wZ-qg&retina=true",
  },
  cohere: { website: "https://cohere.com" },
  perplexity: { website: "https://perplexity.ai" },
  openai: { website: "https://openai.com" },
  anthropic: { website: "https://anthropic.com" },
  hashicorp: { website: "https://hashicorp.com" },
  mongodb: { website: "https://mongodb.com" },
  langchain: { website: "https://langchain.com" },
  coderabbit: { website: "https://coderabbit.ai" },
  elevenlabs: { website: "https://elevenlabs.io" },
  hockeystack: { website: "https://hockeystack.com" },
  gptzero: { website: "https://gptzero.me" },
  classdojo: { website: "https://classdojo.com" },
  clickup: { website: "https://clickup.com" },
  livekit: { website: "https://livekit.io" },
  motherduck: { website: "https://motherduck.com" },
  fullstory: { website: "https://fullstory.com" },
  posthog: { website: "https://posthog.com" },
  lancedb: { website: "https://lancedb.com" },
  webai: { website: "https://webai.com" },
  gigaml: { website: "https://giga.ml" },
  signoz: { website: "https://signoz.io" },
  revenuecat: { website: "https://revenuecat.com" },
  stackone: { website: "https://stackone.com" },
  fleetworks: { website: "https://fleetworks.ai" },
  buildwithfern: { website: "https://buildwithfern.com" },
  mazedesign: { website: "https://maze.co" },
  stainlessapi: { website: "https://stainless.com" },
  deepl: { website: "https://deepl.com" },
  a16z: { website: "https://a16z.com" },
  sweetgreen: { website: "https://sweetgreen.com" },
  project44: { website: "https://project44.com" },
  dbtlabsinc: { website: "https://getdbt.com" },
  scaleai: { website: "https://scale.com" },
  togetherai: { website: "https://together.ai" },
  snorkelai: { website: "https://snorkel.ai" },
  stabilityai: { website: "https://stability.ai" },
  arizeai: { website: "https://arize.com" },
  bluefishai: { website: "https://bluefish.ai" },
  blackforestlabs: { website: "https://blackforestlabs.ai" },
  figureai: { website: "https://figure.ai" },
  furtherai: { website: "https://further.ai" },
  apolloio: { website: "https://apollo.io" },
  grafanalabs: { website: "https://grafana.com" },
  cockroachlabs: { website: "https://cockroachlabs.com" },
  ginkgobioworks: { website: "https://ginkgobioworks.com" },
  abnormalsecurity: { website: "https://abnormalsecurity.com" },
  orcasecurity: { website: "https://orca.security" },
  sumologic: { website: "https://sumologic.com" },
  newrelic: { website: "https://newrelic.com" },
  sigmacomputing: { website: "https://sigmacomputing.com" },
  launchdarkly: { website: "https://launchdarkly.com" },

  // Generic-name GH boards owned by smaller companies (not the big-brand
  // namesake the heuristic would otherwise guess).
  crescent: { website: "https://www.crescentway.com" },

  // Tokens that obviously map to a different brand domain
  doordashusa: { website: "https://doordash.com" },
  couchbaseinc: { website: "https://couchbase.com" },
  cariboubiosciencesinc: { website: "https://cariboubio.com" },
  caredxinc: { website: "https://caredx.com" },
  bottomlinetechnologies: { website: "https://bottomline.com" },
  vianttechnology: { website: "https://viant.com" },
  alarmcom: { website: "https://alarm.com" },
  "1stdibscom": { website: "https://1stdibs.com" },
  riotgames: { website: "https://riotgames.com" },
  spacex: { website: "https://spacex.com" },
  lucidmotors: { website: "https://lucidmotors.com" },
  andurilindustries: { website: "https://anduril.com" },
  appliedintuition: { website: "https://appliedintuition.com" },
  aurorainnovation: { website: "https://aurora.tech" },
  astspacemobile: { website: "https://ast-science.com" },
  asteralabs: { website: "https://asteralabs.com" },
  axiom: { website: "https://axiomspace.com" },
  abcellera: { website: "https://abcellera.com" },
  bridgebio: { website: "https://bridgebio.com" },
  billiontoone: { website: "https://billiontoone.com" },

  // Common Ashby brand domains
  supabase: { website: "https://supabase.com" },
  vercel: { website: "https://vercel.com" },
  airbyte: { website: "https://airbyte.com" },
  benchling: { website: "https://benchling.com" },
  sentry: { website: "https://sentry.io" },
  snowflake: { website: "https://snowflake.com" },
  vanta: { website: "https://vanta.com" },
  deel: { website: "https://deel.com" },
  whatnot: { website: "https://whatnot.com" },
  pinecone: { website: "https://pinecone.io" },
  modal: { website: "https://modal.com" },
  replit: { website: "https://replit.com" },
  zapier: { website: "https://zapier.com" },
  docker: { website: "https://docker.com" },
  redis: { website: "https://redis.io" },
  mintlify: { website: "https://mintlify.com" },
  decagon: { website: "https://decagon.ai" },
  cursor: { website: "https://cursor.com" },
  anyscale: { website: "https://anyscale.com" },
  cognition: { website: "https://cognition.ai" },
  weaviate: { website: "https://weaviate.io" },
  lovable: { website: "https://lovable.dev" },
  mistral: { website: "https://mistral.ai" },
  runway: { website: "https://runwayml.com" },
  drata: { website: "https://drata.com" },
  plaid: { website: "https://plaid.com" },
  confluent: { website: "https://confluent.io" },
  neon: { website: "https://neon.tech" },
  prefect: { website: "https://prefect.io" },
  babbel: { website: "https://babbel.com" },
  preply: { website: "https://preply.com" },
  classroomdojo: { website: "https://classdojo.com" },
  exa: { website: "https://exa.ai" },
  writer: { website: "https://writer.com" },
  tavily: { website: "https://tavily.com" },
  sierra: { website: "https://sierra.ai" },
  tracebit: { website: "https://tracebit.com" },
  infisical: { website: "https://infisical.com" },
  deepgram: { website: "https://deepgram.com" },

  // Hyphenated tokens
  "norm-ai": { website: "https://norm.ai" },
  "basis-ai": { website: "https://basis.ai" },
  "fiddler-ai": { website: "https://fiddler.ai" },
  "cogent-security": { website: "https://cogentsecurity.com" },
  "talos-trading": { website: "https://talostrading.com" },
  "pylon-labs": { website: "https://usepylon.com" },
  "rox-data-corp": { website: "https://rox.com" },
  "d-matrix": { website: "https://d-matrix.ai" },
};

const GREENHOUSE_OVERRIDES: Record<string, LogoOverride> = {};
const ASHBY_OVERRIDES: Record<string, LogoOverride> = {};

/**
 * In-process cache for DB-backed override lookups. Process-local Map (NOT
 * Redis) — admin edits invalidate via `invalidateLogoOverrideCache()` from
 * the API routes, and the 60s TTL bounds staleness across processes.
 */
interface CacheEntry {
  value: LogoOverride | null;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(provider: AtsProvider, slug: string): string {
  return `${provider}:${slug}`;
}

/**
 * Drop all cached override lookups. Called from POST/PATCH/DELETE on the
 * admin API so admin edits become visible within the next request, not
 * after the 60s TTL.
 */
export function invalidateLogoOverrideCache(): void {
  cache.clear();
}

/**
 * Look up a curated logo/website override for a given provider+slug pair.
 *
 * Reads the DB-backed `CompanyLogoOverride` table by default. If the env var
 * `LOGO_OVERRIDES_FROM_DB=false`, falls back to the TS map directly (for
 * environments without DB access — e.g. unit tests, CLI scripts running
 * against a mock).
 *
 * Returns `null` (NOT `undefined`) when no override is found. The
 * `LogoOverride | null` return type signals "queried, found nothing"
 * distinct from a thrown error. The legacy synchronous TS-map fallback
 * `lookupFromTsMap()` remains `undefined`-returning for back-compat.
 */
export async function lookupLogoOverride(
  provider: AtsProvider,
  slug: string,
): Promise<LogoOverride | null> {
  if (process.env.LOGO_OVERRIDES_FROM_DB === "false") {
    return lookupFromTsMap(provider, slug) ?? null;
  }

  const key = cacheKey(provider, slug);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Strip provider prefix to match the seed key shape (e.g. "ashby-supabase"
  // → "supabase"). The DB stores raw slugs as supplied by callers; we look
  // up with the normalized form first, then fall back to the raw form so
  // both paths work during the migration window.
  const normalized = stripProviderPrefix(provider, slug).toLowerCase();
  const row =
    (await db.companyLogoOverride.findUnique({
      where: { provider_slug: { provider, slug: normalized } },
    })) ??
    (await db.companyLogoOverride.findUnique({
      where: { provider_slug: { provider, slug } },
    }));

  const value: LogoOverride | null = row
    ? {
        website: row.website ?? undefined,
        logoUrl: row.logoUrl ?? undefined,
      }
    : (lookupFromTsMap(provider, slug) ?? null);

  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Pure synchronous lookup against the bundled TS map. Used as the fallback
 * path when `LOGO_OVERRIDES_FROM_DB=false` and as the source for the seed
 * script. Kept as a separate export so non-DB call sites (CLI scripts,
 * tests) can still use the map directly without a Prisma dependency.
 */
export function lookupFromTsMap(
  provider: AtsProvider,
  slug: string,
): LogoOverride | undefined {
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

export function allLogoOverrides(): {
  shared: Readonly<Record<string, LogoOverride>>;
  greenhouse: Readonly<Record<string, LogoOverride>>;
  ashby: Readonly<Record<string, LogoOverride>>;
} {
  return {
    shared: SHARED_OVERRIDES,
    greenhouse: GREENHOUSE_OVERRIDES,
    ashby: ASHBY_OVERRIDES,
  };
}
