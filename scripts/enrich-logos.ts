import 'dotenv/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db } from '../src/lib/db';
import { SEED_BOARDS } from '../src/lib/greenhouse/sync';
import { getSpacesClient, SPACES_BUCKET } from '../src/lib/spaces';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOGO_DEV_KEY = process.env.LOGO_DEV_KEY;
if (!LOGO_DEV_KEY) {
  console.error('LOGO_DEV_KEY not set in environment');
  process.exit(1);
}

const SPACES_REGION = process.env.DO_SPACES_REGION ?? 'nyc3';
const RATE_LIMIT_MS = 300;

// Manual domain overrides for tokens whose slug doesn't match the public domain
const DOMAIN_MAP: Record<string, string> = {
  anthropic: 'anthropic.com',
  stripe: 'stripe.com',
  linear: 'linear.app',
  vercel: 'vercel.com',
  figma: 'figma.com',
  notion: 'notion.so',
  openai: 'openai.com',
  databricks: 'databricks.com',
  hashicorp: 'hashicorp.com',
  shopify: 'shopify.com',
  okta: 'okta.com',
  twilio: 'twilio.com',
  coinbase: 'coinbase.com',
  cloudflare: 'cloudflare.com',
  mongodb: 'mongodb.com',
  datadog: 'datadoghq.com',
  elastic: 'elastic.co',
  amplitude: 'amplitude.com',
  braze: 'braze.com',
  appian: 'appian.com',
  applovin: 'applovin.com',
  webflow: 'webflow.com',
  commvault: 'commvault.com',
  agilysys: 'agilysys.com',
  bandwidth: 'bandwidth.com',
  avepoint: 'avepoint.com',
  digimarc: 'digimarc.com',
  audioeye: 'audioeye.com',
  affinity: 'affinity.serif.com',
  celonis: 'celonis.com',
  samsara: 'samsara.com',
  couchbaseinc: 'couchbase.com',
  bottomlinetechnologies: 'bottomline.com',
  alarmcom: 'alarm.com',
  dropbox: 'dropbox.com',
  '1stdibscom': '1stdibs.com',
  vianttechnology: 'viantinc.com',
  backblaze: 'backblaze.com',
  airship: 'airship.com',
  alchemy: 'alchemy.com',
  check: 'checkhq.com',
  chime: 'chime.com',
  community: 'community.com',
  corescientific: 'corescientific.com',
  coreweave: 'coreweave.com',
  airbnb: 'airbnb.com',
  carvana: 'carvana.com',
  doordashusa: 'doordash.com',
  cargurus: 'cargurus.com',
  pinterest: 'pinterest.com',
  duolingo: 'duolingo.com',
  agoda: 'agoda.com',
  buzzfeed: 'buzzfeed.com',
  angi: 'angi.com',
  allbirds: 'allbirds.com',
  hellofresh: 'hellofresh.com',
  riotgames: 'riotgames.com',
  clear: 'clearme.com',
  affirm: 'affirm.com',
  apollo: 'apollo.com',
  block: 'block.xyz',
  public: 'public.com',
  optoinvest: 'optoinvest.com',
  proshares: 'proshares.com',
  pathward: 'pathward.com',
  bitcoindepot: 'bitcoindepot.com',
  bitfarms: 'bitfarms.com',
  costar: 'costar.com',
  godaddy: 'godaddy.com',
  esri: 'esri.com',
  canonical: 'canonical.com',
  axon: 'axon.com',
  verisign: 'verisign.com',
  align: 'aligntech.com',
  eqtcorporation: 'eqt.com',
  spacex: 'spacex.com',
  lucidmotors: 'lucidmotors.com',
  andurilindustries: 'anduril.com',
  appliedintuition: 'appliedintuition.com',
  aurorainnovation: 'aurora.tech',
  archer: 'archer.com',
  astspacemobile: 'ast-science.com',
  axiom: 'axiomspace.com',
  asteralabs: 'asteralabs.com',
  abcellera: 'abcellera.com',
  absci: 'absci.com',
  acadiapharmaceuticals: 'acadia.com',
  adaptivebiotechnologies: 'adaptivebiotech.com',
  apogeetherapeutics: 'apogeetherapeutics.com',
  arvinas: 'arvinas.com',
  axsometherapeutics: 'axsome.com',
  avalotherapeutics: 'avalotx.com',
  axogen: 'axogeninc.com',
  beamtherapeutics: 'beamtx.com',
  billiontoone: 'billiontoone.com',
  bridgebio: 'bridgebio.com',
  carbon: 'carbon3d.com',
  caredxinc: 'caredx.com',
  cariboubiosciencesinc: 'cariboubio.com',
  celcuity: 'celcuity.com',
  ceribell: 'ceribell.com',
  cerus: 'cerus.com',
  cogentbiosciences: 'cogentbiosciences.com',
  compasspathways: 'compasspathways.com',
  compasstherapeutics: 'compasstherapeutics.com',
  corcepttherapeutics: 'corcept.com',
  cytokinetics: 'cytokinetics.com',
  dayonebiopharmaceuticals: 'dayonebio.com',
  definiumtherapeutics: 'definiumtx.com',
  dianthustherapeutics: 'dianthustx.com',
  dynetherapeutics: 'dynetherapeutics.com',
  alumis: 'alumis.com',
  amylyx: 'amylyx.com',
  anterix: 'anterix.com',
  cloverhealth: 'cloverhealth.com',
  nerdy: 'nerdy.com',
  bayada: 'bayada.com',
  lakefieldveterinarygroup: 'lakefieldvet.com',
  assetliving: 'assetliving.com',
  coupang: 'coupang.com',
  olsson: 'olsson.com',
  metron: 'metronav.com',
  yld: 'yld.io',
  hasbro: 'hasbro.com',
  fox: 'foxcorporation.com',
  genuine: 'genuineparts.com',
  realpha: 'realpha.com',
  airsculpt: 'airsculpt.com',
  aura: 'aura.com',
  able: 'able.co',
  acumen: 'acumen.org',
  activate: 'activate.org',
  allied: 'allieduniversal.com',
  apex: 'apexgroup.com',
  ark: 'ark.com',
  array: 'array.com',
  baidu: 'baidu.com',
  beam: 'beam.dental',
  beyond: 'beyondmeat.com',
  bluemoonmetals: 'bluemoonmetals.com',
  bold: 'bold.com',
  broadway: 'broadway.com',
  caribou: 'caribou.com',
  charles: 'charles.co',
  clearfield: 'clearfieldconnection.com',
  comstock: 'comstock.com',
  crescent: 'crescentenergy.com',
  ess: 'essinc.com',
  general: 'general.com',
  international: 'international.com',
  journey: 'journeyapp.com',
  universal: 'universal.com',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDomain(token: string): string {
  return DOMAIN_MAP[token] ?? `${token}.com`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLogo(domain: string): Promise<Buffer> {
  const url = `https://img.logo.dev/${domain}?token=${LOGO_DEV_KEY}&size=200&format=png`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`logo.dev returned ${res.status} for ${domain}`);
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 200) throw new Error(`Logo too small (${arrayBuffer.byteLength} bytes) — likely a placeholder`);
  return Buffer.from(arrayBuffer);
}

async function uploadToSpaces(
  client: S3Client,
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: 'public-read',
    })
  );

  return `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/${key}`;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { force: boolean; singleSlug: string | null } {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const companyArg = args.find((a) => a.startsWith('--company='));
  const singleSlug = companyArg ? companyArg.slice(companyArg.indexOf('=') + 1) : null;
  return { force, singleSlug };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { force, singleSlug } = parseArgs();

  const spacesClient = getSpacesClient();
  if (!spacesClient) {
    console.error('DO Spaces is not configured — set DO_SPACES_KEY and DO_SPACES_SECRET');
    process.exit(1);
  }

  const boards = singleSlug
    ? SEED_BOARDS.filter((b) => b.token === singleSlug)
    : SEED_BOARDS;

  if (singleSlug && boards.length === 0) {
    console.error(`No board found with token "${singleSlug}"`);
    process.exit(1);
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < boards.length; i++) {
    const { token, name } = boards[i];

    // Rate limit — skip delay on first iteration
    if (i > 0) await delay(RATE_LIMIT_MS);

    try {
      // Check existing logoUrl unless --force
      if (!force) {
        const existing = await db.company.findUnique({
          where: { slug: token },
          select: { logoUrl: true },
        });
        if (existing?.logoUrl) {
          console.log(`→ skipped  ${name} (${token}) — logoUrl already set`);
          skipped++;
          continue;
        }
      }

      const domain = getDomain(token);
      const key = `logos/${token}.png`;
      const buffer = await fetchLogo(domain);
      const publicUrl = await uploadToSpaces(spacesClient, key, buffer, 'image/png');

      await db.company.upsert({
        where: { slug: token },
        update: { logoUrl: publicUrl },
        create: { name, slug: token, logoUrl: publicUrl },
      });

      console.log(`✓ success  ${name} (${token}) — ${publicUrl}`);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ error    ${name} (${token}) — ${message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${skipped} skipped, ${failed} failed`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
