"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import {
  Briefcase,
  Bookmark,
  LayoutDashboard,
  User,
  Shield,
  LogIn,
  Gift,
} from "lucide-react"
import { Icon } from "@iconify/react"
import { CreditsBadge } from "@/components/billing/credits-badge"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { FeedbackButton } from "@/components/feedback-button"
import { AccountMenu } from "@/components/layout/account-menu"

function BaseballBatIcon({ className }: { className?: string }) {
  // Sourced from Font Awesome 6 Free via Iconify. Browse 200K+ icons at
  // https://icon-sets.iconify.design — usage is `<Icon icon="pack:name" />`.
  return <Icon icon="fa6-solid:baseball-bat-ball" className={className} />
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
            <AccountMenu variant="sidebar" />
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
