"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import {
  Briefcase,
  LayoutDashboard,
  User,
  Zap,
  Shield,
  LogOut,
  LogIn,
} from "lucide-react"
import { CreditsBadge } from "@/components/billing/credits-badge"

const publicNavItems = [
  { href: "/jobs", label: "Browse Jobs", icon: Briefcase },
]

const authNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/billing", label: "Pro", icon: Zap },
]

export function UserSidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()

  function isActive(href: string) {
    if (href === "/jobs") return pathname?.startsWith("/jobs") ?? false
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
    <aside className="w-64 min-h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col shrink-0">
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
      <nav className="flex-1 p-4 space-y-1">
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

      {/* Footer */}
      <div className="p-4 border-t border-zinc-800 space-y-2">
        {session ? (
          <>
            <div className="px-3 py-1">
              <CreditsBadge />
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
