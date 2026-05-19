"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PipelineLogo } from "@/components/brand/PipelineLogo";

// Routes that own a full-viewport container-scroll surface and therefore
// must NOT render the page-level CompactSiteFooter (it would steal the
// remaining viewport height from the scroll container).
// NOTE: exact match only — `/jobs/[publicJobId]` keeps its footer.
const NO_FOOTER_ROUTES = new Set<string>(["/jobs"]);

// Editorial footer treatment — see design_handoff_homepage_redesign/README.md §Footer.
// Visual rules:
//   - Border-top: rgba(245,244,241,0.06)
//   - Radial glow at bottom-center: rgba(99,102,241,0.14) → transparent 60%
//   - Mono (Geist Mono via font-mono) for column labels + copyright micro-copy
//   - Body links sans-serif, ~13.5px, #a1a1aa → #f5f4f1 on hover; accent #c4b5fd
//   - 150ms ease transitions
// All existing link routes and conditional (signed-in / signed-out) sections preserved.

const FOOTER_BORDER = "border-t border-[rgba(245,244,241,0.06)]";
const GLOW_LAYER =
  "pointer-events-none absolute inset-x-0 bottom-0 h-[260px] " +
  "bg-[radial-gradient(ellipse_at_50%_100%,rgba(99,102,241,0.14),transparent_60%)]";

const linkBase =
  "text-[#a1a1aa] hover:text-[#f5f4f1] transition-colors duration-150 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-sm";

const columnLabel =
  "font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-[#71717a] mb-4";

const bodyLink = `${linkBase} text-[13.5px] leading-relaxed`;

const microCopy = "font-mono text-[11.5px] text-[#71717a]";

export function Footer() {
  const { data: session } = useSession();

  return (
    <footer className={`relative mt-auto overflow-hidden bg-black ${FOOTER_BORDER}`}>
      <div className={GLOW_LAYER} aria-hidden="true" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Link
              href="/"
              className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm"
            >
              <PipelineLogo aria-label="Pipeline" className="h-10 w-auto opacity-95 shrink-0" />
            </Link>
            <p className="mt-4 text-[13.5px] text-[#a1a1aa] leading-relaxed">
              One profile. Every application. AI-powered tracking so you can focus on landing the
              role.
            </p>
          </div>

          <div className="flex flex-col gap-10 sm:flex-row sm:gap-16">
            <div>
              <h3 className={columnLabel}>Product</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/jobs" className={bodyLink}>
                    Browse jobs
                  </Link>
                </li>
                {session ? (
                  <>
                    <li>
                      <Link href="/dashboard" className={bodyLink}>
                        Dashboard
                      </Link>
                    </li>
                    <li>
                      <Link href="/profile" className={bodyLink}>
                        Profile
                      </Link>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link href="/auth/signin" className={bodyLink}>
                      Sign in
                    </Link>
                  </li>
                )}
              </ul>
            </div>

            {/* Support — rendered for both authenticated and anonymous users. */}
            <div>
              <h3 className={columnLabel}>Support</h3>
              <ul className="space-y-3">
                <li>
                  <Link href="/contact" className={bodyLink}>
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className={bodyLink}>
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className={bodyLink}>
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/cookies" className={bodyLink}>
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link href="/privacy/do-not-sell" className={bodyLink}>
                    Do Not Sell or Share
                  </Link>
                </li>
                <li>
                  {/*
                    Termly preference-center trigger. The "termly-display-preferences"
                    class is the exact hook Termly's banner SDK binds to at runtime —
                    do not rename. Plain <a> (not next/link) so the SDK's click
                    handler runs without router interception.
                  */}
                  <a href="#" className={`termly-display-preferences ${bodyLink}`}>
                    Consent Preferences
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div
          className={`mt-12 pt-8 border-t border-[rgba(245,244,241,0.06)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4`}
        >
          <div className="flex items-center gap-4">
            <p className={microCopy}>Built for job seekers who move fast.</p>
            <a
              href="https://logo.dev"
              className={`${microCopy} hover:text-[#a1a1aa] transition-colors duration-150 ease-out`}
            >
              Logos provided by Logo.dev
            </a>
          </div>
          <p className={microCopy}>
            © {new Date().getFullYear()} Pipeline. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// Compact variant rendered inside (main) and (dashboard) layouts (including the
// editorial homepage). Same editorial treatment but condensed to a single row.
const compactLink =
  "font-mono text-[11.5px] text-[#a1a1aa] hover:text-[#f5f4f1] transition-colors duration-150 ease-out " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-sm";

export function CompactSiteFooter() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // /jobs owns the full viewport — see NO_FOOTER_ROUTES above.
  if (pathname && NO_FOOTER_ROUTES.has(pathname)) return null;

  return (
    <footer
      className={`relative shrink-0 overflow-hidden bg-black px-4 py-3 sm:px-6 ${FOOTER_BORDER}`}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[140px] bg-[radial-gradient(ellipse_at_50%_100%,rgba(99,102,241,0.14),transparent_60%)]"
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-sm"
          >
            <PipelineLogo aria-label="Pipeline" className="h-9 w-auto opacity-90 shrink-0" />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/jobs" className={compactLink}>
              Browse jobs
            </Link>
            {session ? (
              <>
                <Link href="/dashboard" className={compactLink}>
                  Dashboard
                </Link>
                <Link href="/profile" className={compactLink}>
                  Profile
                </Link>
              </>
            ) : (
              <Link href="/auth/signin" className={compactLink}>
                Sign in
              </Link>
            )}
            {/* Always rendered (auth-agnostic) — referenced from the public Terms of Service. */}
            <Link href="/contact" className={compactLink}>
              Contact
            </Link>
            <Link href="/terms" className={compactLink}>
              Terms
            </Link>
            <Link href="/privacy" className={compactLink}>
              Privacy
            </Link>
            <Link href="/cookies" className={compactLink}>
              Cookies
            </Link>
            {/* Termly preference-center trigger — see Footer for explanation. */}
            <a href="#" className={`termly-display-preferences ${compactLink}`}>
              Preferences
            </a>
          </nav>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <a
            href="https://logo.dev"
            className={`${microCopy} shrink-0 hover:text-[#a1a1aa] transition-colors duration-150 ease-out`}
          >
            Logos provided by Logo.dev
          </a>
          <p className={microCopy}>© {new Date().getFullYear()} Pipeline. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
