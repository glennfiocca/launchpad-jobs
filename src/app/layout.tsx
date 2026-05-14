import type { Metadata } from "next";
import { Inter, Bricolage_Grotesque, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ProgressBar } from "@/components/layout/progress-bar";
import { FeedbackTab } from "@/components/layout/feedback-tab";
import { Toaster } from "sonner";
import { authOptions } from "@/lib/auth";
import { isGpcRequest } from "@/lib/gpc/detect";

// Plausible stub-and-init snippet. Queues `plausible(...)` calls until the
// main script loads, then forwards them. `plausible.init()` triggers the
// initial pageview track. Gated to production so dev traffic doesn't pollute
// the dashboard.
const PLAUSIBLE_INIT = `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`;

// Termly consent banner + cookie auto-blocker. Loads BEFORE Plausible so
// Termly can intercept and block analytics until the user consents (or
// permanently if GPC is on — Termly respects the GPC signal automatically
// and won't show the banner to those users). The website UUID is from
// Termly Dashboard → Consent Banner → Install.
const TERMLY_WEBSITE_UUID = "cab779b8-1bd3-4a4c-b9ff-51123bbcd9c4";

const inter = Inter({ subsets: ["latin"] });

// Editorial homepage redesign typography. Both exposed as CSS variables so
// they can be referenced from globals.css's @theme block (--font-display,
// --font-mono) without coupling individual components to next/font imports.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

// Distinct variable name (--font-geist-mono) avoids a self-referencing
// circular fallback inside globals.css @theme, where Tailwind v4 also
// defines --font-mono as a typography token.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pipeline — One-Click Job Applications",
  description: "Apply to top tech jobs in one click. Track your applications, communicate with recruiters, and land your dream job.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isProd = process.env.NODE_ENV === "production";
  // Suppress non-essential analytics when the user's browser sends the
  // Global Privacy Control signal (CCPA/CPRA universal opt-out).
  const gpc = await isGpcRequest();
  // Server-fetched session hydrates SessionProvider so useSession() on
  // the first client render returns the authenticated state immediately
  // — no flash of "Sign In" while /api/auth/session round-trips.
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" className={`dark ${bricolage.variable} ${geistMono.variable}`}>
      <head>
        {isProd && (
          <Script
            id="termly-banner"
            src={`https://app.termly.io/resource-blocker/${TERMLY_WEBSITE_UUID}?autoBlock=on`}
            // afterInteractive (not beforeInteractive). In the App Router,
            // beforeInteractive only emits a <link rel="preload"> in the
            // initial HTML — the browser fetches the script but never
            // executes it, so Termly's runtime never binds to the
            // .termly-display-preferences trigger. afterInteractive emits
            // a real <script> tag that runs after hydration. Termly's
            // auto-blocker uses a MutationObserver internally so it can
            // still intercept resources loaded later in the same phase.
            strategy="afterInteractive"
          />
        )}
        {isProd && !gpc && (
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
        <Providers session={session}>
          {children}
        </Providers>
        {/* Persistent right-edge feedback widget. Mounted once at the
            root so it survives route transitions and applies to both
            signed-in and signed-out users; the component itself hides
            on /auth/* routes via usePathname(). */}
        <FeedbackTab />
        <Toaster theme="dark" richColors position="top-right" />
      </body>
    </html>
  );
}
