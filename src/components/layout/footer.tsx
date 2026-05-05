"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

export function Footer() {
  const { data: session } = useSession();

  return (
    <footer className="mt-auto border-t border-white/8 bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <Link
              href="/"
              className="inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm"
            >
              <Image
                src="/pipeline-logo.png"
                alt="Pipeline"
                width={180}
                height={40}
                className="h-7 w-auto opacity-95"
              />
            </Link>
            <p className="mt-4 text-sm text-zinc-500 leading-relaxed">
              One profile. Every application. AI-powered tracking so you can focus on landing the
              role.
            </p>
          </div>

          <div className="flex flex-col gap-10 sm:flex-row sm:gap-16">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                Product
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/jobs"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Browse jobs
                  </Link>
                </li>
                {session ? (
                  <>
                    <li>
                      <Link
                        href="/dashboard"
                        className="text-sm text-zinc-400 hover:text-white transition-colors"
                      >
                        Dashboard
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="/profile"
                        className="text-sm text-zinc-400 hover:text-white transition-colors"
                      >
                        Profile
                      </Link>
                    </li>
                  </>
                ) : (
                  <li>
                    <Link
                      href="/auth/signin"
                      className="text-sm text-zinc-400 hover:text-white transition-colors"
                    >
                      Sign in
                    </Link>
                  </li>
                )}
              </ul>
            </div>

            {/* Support — rendered for both authenticated and anonymous users. */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
                Support
              </h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/cookies"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Cookie Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy/do-not-sell"
                    className="text-sm text-zinc-400 hover:text-white transition-colors"
                  >
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
                  <a
                    href="#"
                    className="termly-display-preferences text-sm text-zinc-400 hover:text-white transition-colors"
                  >
                    Consent Preferences
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-zinc-600">
            © {new Date().getFullYear()} Pipeline. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <p className="text-xs text-zinc-600">Built for job seekers who move fast.</p>
            <a
              href="https://logo.dev"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Logos provided by Logo.dev
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

const compactLinkClass =
  "text-zinc-500 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-sm";

export function CompactSiteFooter() {
  const { data: session } = useSession();

  return (
    <footer className="shrink-0 border-t border-zinc-800 bg-black px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/"
            className="inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 rounded-sm"
          >
            <Image
              src="/pipeline-logo.png"
              alt="Pipeline"
              width={140}
              height={32}
              className="h-5 w-auto opacity-90"
            />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Link href="/jobs" className={compactLinkClass}>
              Browse jobs
            </Link>
            {session ? (
              <>
                <Link href="/dashboard" className={compactLinkClass}>
                  Dashboard
                </Link>
                <Link href="/profile" className={compactLinkClass}>
                  Profile
                </Link>
              </>
            ) : (
              <Link href="/auth/signin" className={compactLinkClass}>
                Sign in
              </Link>
            )}
            {/* Always rendered (auth-agnostic) — referenced from the public Terms of Service. */}
            <Link href="/contact" className={compactLinkClass}>
              Contact
            </Link>
            <Link href="/terms" className={compactLinkClass}>
              Terms
            </Link>
            <Link href="/privacy" className={compactLinkClass}>
              Privacy
            </Link>
            <Link href="/cookies" className={compactLinkClass}>
              Cookies
            </Link>
            {/* Termly preference-center trigger — see Footer for explanation. */}
            <a href="#" className={`termly-display-preferences ${compactLinkClass}`}>
              Preferences
            </a>
          </nav>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 text-xs text-zinc-600">
          <p>© {new Date().getFullYear()} Pipeline. All rights reserved.</p>
          <a
            href="https://logo.dev"
            className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            Logos provided by Logo.dev
          </a>
        </div>
      </div>
    </footer>
  );
}
