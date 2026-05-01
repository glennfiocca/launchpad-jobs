import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // pdfkit ships .afm font data and uses Node `fs` at runtime — keep it
  // outside Next.js bundling so its data files resolve correctly.
  serverExternalPackages: ["@prisma/client", "nodemailer", "pdfkit"],
};

// Sentry build-time wrapper.
// - silent: quiet during local builds, verbose in CI
// - widenClientFileUpload: pull more chunks into source-map upload (better stacks)
// - disableLogger: tree-shake Sentry's debug logger from prod bundles
// - automaticVercelMonitors: false — we deploy on DigitalOcean, not Vercel
// SENTRY_AUTH_TOKEN is intentionally optional: builds succeed without it,
// they just skip source-map upload (the SDK still captures errors).
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
