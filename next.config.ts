import type { NextConfig } from "next";

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

export default nextConfig;
