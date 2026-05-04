import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ProgressBar } from "@/components/layout/progress-bar";
import { Toaster } from "sonner";

// Plausible stub-and-init snippet. Queues `plausible(...)` calls until the
// main script loads, then forwards them. `plausible.init()` triggers the
// initial pageview track. Gated to production so dev traffic doesn't pollute
// the dashboard.
const PLAUSIBLE_INIT = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`;

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pipeline — One-Click Job Applications",
  description: "Apply to top tech jobs in one click. Track your applications, communicate with recruiters, and land your dream job.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html lang="en" className="dark">
      <head>
        {isProd && (
          <>
            <Script
              src="https://plausible.io/js/pa-zA1aaVPKsRXRJSlqj8x09.js"
              strategy="afterInteractive"
              async
            />
            <Script
              id="plausible-init"
              strategy="afterInteractive"
            >
              {PLAUSIBLE_INIT}
            </Script>
          </>
        )}
      </head>
      <body className={`${inter.className} bg-black text-white antialiased`}>
        <ProgressBar />
        <Providers>
          {children}
        </Providers>
        <Toaster theme="dark" richColors position="top-right" />
      </body>
    </html>
  );
}
