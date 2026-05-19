"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CreditsBadge } from "@/components/billing/credits-badge";
import { ReferBadge } from "@/components/billing/refer-badge";
import { UpgradePill } from "@/components/layout/upgrade-pill";
import { AccountMenu } from "@/components/layout/account-menu";

// Editorial navbar — Direction C ("Manifold") layout.
//
// Three-zone composition:
//   • Logo, flush left
//   • Tabs pill, absolutely centered (hidden under 1080px)
//   • Right cluster, flush right (CreditsBadge / ReferBadge / UpgradePill / AccountMenu)
//
// Signed-out variant: shows only "Browse Jobs" in the tabs pill and
// replaces the entire right cluster with a ghost "Sign in" link. All
// session/admin role gating preserves the prior behavior.

interface Tab {
  href: string;
  label: string;
  /** Match function — receives the current pathname. */
  match: (path: string) => boolean;
}

const BROWSE_TAB: Tab = {
  href: "/jobs",
  label: "Browse Jobs",
  match: (p) => p.startsWith("/jobs"),
};

const SIGNED_IN_TABS: ReadonlyArray<Tab> = [
  BROWSE_TAB,
  {
    href: "/dashboard",
    label: "Dashboard",
    match: (p) => p.startsWith("/dashboard"),
  },
  { href: "/profile", label: "Profile", match: (p) => p === "/profile" },
];

const ADMIN_TAB: Tab = {
  href: "/admin",
  label: "Admin",
  match: (p) => p.startsWith("/admin"),
};

const TAB_BASE_CLASS =
  "px-4 py-[7px] rounded-full text-[13px] font-medium font-display whitespace-nowrap " +
  "transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

const TAB_INACTIVE_CLASS = "text-text-muted hover:text-text";

// Active-tab styling per spec — linear-gradient background with inset
// 1px lavender ring. Tailwind v4 inline shadow arbitrary supports the
// `inset` keyword so we stay declarative.
const TAB_ACTIVE_CLASS =
  "text-text bg-gradient-to-b from-[rgba(167,139,250,0.18)] to-[rgba(99,102,241,0.12)] " +
  "shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)]";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname() ?? "";

  const isAdmin = session?.user?.role === "ADMIN";
  const tabs: ReadonlyArray<Tab> = session
    ? isAdmin
      ? [...SIGNED_IN_TABS, ADMIN_TAB]
      : SIGNED_IN_TABS
    : [BROWSE_TAB];

  return (
    <nav
      className="sticky top-0 z-50 bg-bg/[0.82] backdrop-blur-[20px] border-b border-white/[0.06]"
      aria-label="Primary"
    >
      <div className="relative w-full px-7 py-[14px] flex items-center justify-between gap-6">
        {/* Logo — flush left. Intrinsic 1280x340 (~3.76:1); rendered height
            driven by Tailwind, width auto-scales to preserve aspect. */}
        <Link
          href="/"
          className="flex items-center shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <Image
            src="/pipeline-lockup.png"
            alt="Pipeline"
            width={1280}
            height={340}
            priority
            className="h-10 md:h-14 w-auto shrink-0"
          />
        </Link>

        {/* Tabs pill — absolutely centered, hidden under 1080px. */}
        <nav
          className="hidden min-[1080px]:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 p-1 rounded-full bg-white/[0.03] border border-white/[0.06]"
          aria-label="Sections"
        >
          {tabs.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(TAB_BASE_CLASS, active ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS)}
                aria-current={active ? "page" : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster — flush right. */}
        <div className="flex items-center gap-2.5 shrink-0">
          {session ? (
            <>
              <CreditsBadge />
              <ReferBadge />
              <UpgradePill />
              <AccountMenu variant="navbar" />
            </>
          ) : (
            <Link
              href="/auth/signin"
              className="px-3 py-1.5 rounded-full text-[13px] font-medium font-display text-zinc-300 hover:text-text hover:bg-white/5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
