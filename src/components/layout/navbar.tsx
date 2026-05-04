"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, User, LogIn, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreditsBadge } from "@/components/billing/credits-badge";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AccountMenu } from "@/components/layout/account-menu";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/8">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-sm"
          >
            <Image
              src="/pipeline-logo.png"
              alt="Pipeline"
              width={200}
              height={44}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
              <Link
                href="/jobs"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname?.startsWith("/jobs")
                    ? "text-white relative after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-gradient-to-r after:from-indigo-500 after:to-blue-500 after:rounded-full"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                )}
              >
                Browse Jobs
              </Link>
            </motion.div>

            {session ? (
              <>
                <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                  <Link
                    href="/dashboard"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname?.startsWith("/dashboard")
                        ? "text-white relative after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-gradient-to-r after:from-indigo-500 after:to-blue-500 after:rounded-full"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                </motion.div>
                <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                  <Link
                    href="/profile"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname === "/profile"
                        ? "text-white relative after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-gradient-to-r after:from-indigo-500 after:to-blue-500 after:rounded-full"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                </motion.div>
                <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                  <Link
                    href="/billing"
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      pathname === "/billing"
                        ? "text-white relative after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-gradient-to-r after:from-indigo-500 after:to-blue-500 after:rounded-full"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Zap className="w-4 h-4" />
                    Pro
                  </Link>
                </motion.div>
                {session?.user?.role === "ADMIN" && (
                  <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                    <Link
                      href="/admin"
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        pathname?.startsWith("/admin")
                          ? "text-violet-400 relative after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-violet-500 after:rounded-full"
                          : "text-zinc-400 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Shield className="w-4 h-4" />
                      Admin
                    </Link>
                  </motion.div>
                )}
                <CreditsBadge />
                <NotificationBell />
                <AccountMenu variant="navbar" />
              </>
            ) : (
              <motion.div whileHover={{ y: -1 }} transition={{ duration: 0.15, ease: "easeOut" }}>
                <Link
                  href="/auth/signin"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-black hover:bg-white/90 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
