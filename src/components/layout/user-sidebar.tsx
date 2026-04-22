"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import {
  Briefcase,
  Bookmark,
  LayoutDashboard,
  User,
  Shield,
  LogOut,
  LogIn,
  Gift,
} from "lucide-react"
import { CreditsBadge } from "@/components/billing/credits-badge"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { FeedbackButton } from "@/components/feedback-button"

function BaseballBatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20 L18 6" />
      <path d="M18 6 C18 6 20 4 21 4 C22 5 20 7 18 6Z" />
    </svg>
  )
}

const publicNavItems = [
  { href: "/jobs", label: "Browse Jobs", icon: Briefcase },
]

const authNavItems = [
  { href: "/jobs/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
]

const VIOLET_PILL_CLASS =
  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"

export function UserSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  function isActive(href: string) {
    if (href === "/jobs") {
      // exact match only — don't highlight Browse Jobs when on /jobs/saved or sub-routes
      return pathname === "/jobs" || pathname?.startsWith("/jobs?") || false
    }
    if (href === "/jobs/saved") return pathname?.startsWith("/jobs/saved") ?? false
    if (href === "/dashboard") return pathname?.startsWith("/dashboard") ?? false
    if (href === "/admin") return pathname?.startsWith("/admin") ?? false
    return pathname === href
  }

  const navItems = [
    ...publicNavItems,
    ...(session ? authNavItems : []),
    ...(session?.user?.role === "ADMIN"
      ? [{ href: "/admin", label: "Admin", icon: Shield }]
      : []),
  ]

  return (
    <aside className="w-64 h-full bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <Link href="/" className="flex">
          <Image
            src="/pipeline-logo.png"
            alt="Pipeline"
            width={220}
            height={50}
            className="w-full h-auto"
            priority
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto min-h-0 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={[
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive(href)
                ? "bg-violet-500/10 text-violet-400"
                : "text-zinc-400 hover:text-white hover:bg-white/5",
            ].join(" ")}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="px-4 pb-2 space-y-1 shrink-0">
        {session && (
          <>
            <Link href="/billing" className={VIOLET_PILL_CLASS}>
              <BaseballBatIcon className="w-4 h-4" />
              Go Pro
            </Link>
            <Link href="/settings/referrals" className={VIOLET_PILL_CLASS}>
              <Gift className="w-4 h-4" />
              Referrals
            </Link>
          </>
        )}
        <FeedbackButton variant="sidebar" />
      </div>

      {/* Account */}
      <div className="p-4 border-t border-zinc-800 space-y-2 shrink-0">
        {session ? (
          <>
            <div className="px-3 py-1 flex items-center gap-2">
              <CreditsBadge />
              <NotificationBell />
            </div>
            <div className="px-3 py-1">
              <p className="text-xs text-zinc-500 truncate">{session.user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/auth/signin"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}
