"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import * as Popover from "@radix-ui/react-popover";
import {
  ChevronDown,
  User,
  Bell,
  CreditCard,
  Gift,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initialsFromSeed, seedToHue } from "@/lib/settings/avatar-seed";

interface AccountMenuProps {
  variant: "sidebar" | "navbar";
}

interface MenuItem {
  href: string;
  label: string;
  icon: typeof User;
}

const MENU_ITEMS: ReadonlyArray<MenuItem> = [
  { href: "/settings", label: "Account", icon: User },
  { href: "/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/referrals", label: "Referrals", icon: Gift },
];

function AvatarBubble({
  image,
  seed,
  size,
}: {
  image: string | null | undefined;
  seed: string;
  size: number;
}) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  const hue = seedToHue(seed);
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(135deg, hsl(${hue} 70% 35%), hsl(${(hue + 40) % 360} 70% 25%))`,
      }}
      aria-hidden
    >
      {initialsFromSeed(seed)}
    </div>
  );
}

export function AccountMenu({ variant }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();

  if (!session?.user) return null;

  const email = session.user.email ?? "";
  const name = session.user.name ?? "";
  const displaySeed = email || name || "user";
  const triggerLabel = name || email;

  const triggerClass =
    variant === "sidebar"
      ? "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      : "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={triggerClass} aria-label="Account menu">
          <AvatarBubble
            image={session.user.image}
            seed={displaySeed}
            size={variant === "sidebar" ? 28 : 28}
          />
          <span className="flex-1 truncate text-left">{triggerLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={variant === "sidebar" ? "start" : "end"}
          side={variant === "sidebar" ? "top" : "bottom"}
          sideOffset={8}
          className="w-64 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150"
        >
          <div className="p-3 border-b border-white/10 flex items-center gap-3">
            <AvatarBubble image={session.user.image} seed={displaySeed} size={36} />
            <div className="min-w-0 flex-1">
              {name && (
                <p className="text-sm font-medium text-white truncate">{name}</p>
              )}
              <p className="text-xs text-zinc-500 truncate">{email}</p>
            </div>
          </div>
          <nav className="p-1.5">
            {MENU_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                <Icon className="w-4 h-4 text-zinc-500" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-white/10 p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: "/" });
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300",
                "hover:bg-red-500/10 hover:text-red-400 transition-colors",
              )}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
