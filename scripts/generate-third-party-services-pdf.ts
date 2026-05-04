/**
 * Builds docs/third-party-services-reference.pdf
 * Run: npx tsx scripts/generate-third-party-services-pdf.ts
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outPath = join(root, "docs", "third-party-services-reference.pdf");

const services: { name: string; category: string; what: string; inApp: string; env?: string }[] = [
  {
    name: "Plausible Analytics",
    category: "Product analytics",
    what: "Privacy-oriented, cookie-light page analytics and simple event tracking.",
    inApp: "Production-only script in the root layout loads Plausible and initializes pageviews.",
    env: "(site key embedded in script URL; no app env var)",
  },
  {
    name: "Resend",
    category: "Email",
    what: "Transactional email API (send + inbound webhooks + receiving API).",
    inApp:
      "Magic-link sign-in (NextAuth email provider), notification/digest mail, application outbound mail, inbound webhook to match replies to applications by tracking address.",
    env: "RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_INBOUND_DOMAIN (default track subdomain)",
  },
  {
    name: "Stripe",
    category: "Billing",
    what: "Payments, subscriptions, Checkout, Customer Portal, and webhooks.",
    inApp: "Checkout sessions, subscription lifecycle via webhooks, billing portal, customer create/sync (including on email change).",
    env: "STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  },
  {
    name: "Sentry",
    category: "Observability",
    what: "Error and performance monitoring for Next.js (server, edge, client).",
    inApp: "SDK init via sentry.*.config, Next.js wrapper in next.config, global error capture, optional smoke-test route.",
    env: "SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN; optional SENTRY_AUTH_TOKEN for build uploads",
  },
  {
    name: "Anthropic",
    category: "AI",
    what: "Claude API for natural-language tasks.",
    inApp: "Classifies recruiter/application emails into application status (Haiku model) with retries on transient errors.",
    env: "ANTHROPIC_API_KEY",
  },
  {
    name: "Upstash (Redis)",
    category: "Infrastructure",
    what: "Serverless Redis over HTTPS with a rate-limiting helper library.",
    inApp: "Distributed rate limiting when REST URL + token are set; otherwise in-memory fallback.",
    env: "UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN",
  },
  {
    name: "DigitalOcean Spaces",
    category: "Object storage",
    what: "S3-compatible object storage (AWS SDK client with a Spaces endpoint).",
    inApp: "Resume and file uploads: presigned URLs and public object URLs under the Spaces region host.",
    env: "DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION",
  },
  {
    name: "Google Places API",
    category: "Maps / location",
    what: "Google Maps Platform — Place Autocomplete and Place Details.",
    inApp: "Server routes for location autocomplete and place detail for user profile/location fields.",
    env: "GOOGLE_PLACES_API_KEY",
  },
  {
    name: "Logo.dev",
    category: "Brand assets",
    what: "Logo CDN that resolves company marks from a website hostname.",
    inApp: "Builds img.logo.dev URLs for company logos (dark theme + retina params for the UI).",
    env: "NEXT_PUBLIC_LOGO_DEV_KEY",
  },
  {
    name: "IndexNow",
    category: "SEO",
    what: "Open protocol (used by Bing and others) to notify search engines of URL changes.",
    inApp: "POSTs batches to api.indexnow.org when INDEXNOW_KEY is set; verification file served on-app.",
    env: "INDEXNOW_KEY, NEXT_PUBLIC_APP_URL (for host/key location)",
  },
  {
    name: "Greenhouse (boards API)",
    category: "ATS / job data",
    what: "Public job board JSON API for Greenhouse customers.",
    inApp: "Job sync and board validation — fetches listings from boards-api.greenhouse.io.",
    env: "(no API key for public board endpoints in code paths reviewed)",
  },
  {
    name: "Ashby (posting API)",
    category: "ATS / job data",
    what: "Public Ashby job board HTTP API.",
    inApp: "Job sync for Ashby-hosted boards via api.ashbyhq.com posting-api paths.",
    env: "(public posting API; board slug in URL)",
  },
  {
    name: "Google Fonts (via Next.js)",
    category: "Typography",
    what: "next/font/google loads Inter from Google’s font pipeline at build time.",
    inApp: "Root layout uses Inter from next/font/google.",
    env: "(none)",
  },
];

const infraNote =
  "Deployment docs describe DigitalOcean App Platform for hosting and DigitalOcean Managed PostgreSQL for the database (Prisma DATABASE_URL). Those are infrastructure vendors rather than SDKs in package.json.";

const docNote =
  "DEPLOYMENT.md still mentions UploadThing and Google/GitHub OAuth in places; current auth code uses email magic links via Resend only, and file storage uses DigitalOcean Spaces (S3 SDK). Treat the repo as source of truth.";

type Doc = InstanceType<typeof PDFDocument>;

function writeBody(doc: Doc) {
  const margin = 56;
  const textWidth = doc.page.width - margin * 2;
  const pageBottom = doc.page.height - doc.page.margins.bottom - 24;

  function ensureSpace(needed: number) {
    if (doc.y + needed > pageBottom) {
      doc.addPage();
    }
  }

  doc.fontSize(20).font("Helvetica-Bold").text("Launchpad — third-party services", margin);
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica").fillColor("#444").text(`Generated ${new Date().toISOString().slice(0, 10)} · Quick reference from codebase scan`, margin);
  doc.fillColor("#000");
  doc.moveDown();

  doc.fontSize(11).font("Helvetica").text(
    "This document lists external products and APIs the application integrates with (not every npm dependency). " +
      "First-party secrets (NEXTAUTH_SECRET, CRON_SECRET, JWT signing secrets, etc.) are configuration, not listed as vendor services.",
    margin,
    doc.y,
    { width: textWidth, align: "left" }
  );
  doc.moveDown(1.2);

  for (const s of services) {
    ensureSpace(100);
    doc.fontSize(13).font("Helvetica-Bold").text(s.name, margin);
    doc.moveDown(0.15);
    doc.fontSize(9).font("Helvetica-Oblique").fillColor("#333").text(`Category: ${s.category}`, margin, doc.y, { width: textWidth });
    doc.fillColor("#000");
    doc.moveDown(0.35);
    doc.fontSize(10).font("Helvetica-Bold").text("What it is: ", margin, doc.y, { continued: true });
    doc.font("Helvetica").text(s.what, { width: textWidth });
    doc.moveDown(0.25);
    doc.font("Helvetica-Bold").text("In this app: ", margin, doc.y, { continued: true });
    doc.font("Helvetica").text(s.inApp, { width: textWidth });
    doc.moveDown(0.25);
    if (s.env) {
      doc.font("Helvetica-Bold").text("Env / config: ", margin, doc.y, { continued: true });
      doc.font("Helvetica").text(s.env, { width: textWidth });
    }
    doc.moveDown(0.85);
  }

  ensureSpace(72);
  doc.fontSize(11).font("Helvetica-Bold").text("Hosting & database (documented)", margin);
  doc.moveDown(0.35);
  doc.fontSize(10).font("Helvetica").text(infraNote, margin, doc.y, { width: textWidth });
  doc.moveDown(0.75);
  doc.fontSize(10).font("Helvetica-Oblique").fillColor("#555").text(docNote, margin, doc.y, { width: textWidth });
}

async function run() {
  await mkdir(dirname(outPath), { recursive: true });
  const doc = new PDFDocument({ size: "LETTER", margin: 56, info: { Title: "Third-party services — Launchpad" } });
  const stream = createWriteStream(outPath);
  doc.pipe(stream);
  writeBody(doc);
  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  console.log("Wrote", outPath);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
