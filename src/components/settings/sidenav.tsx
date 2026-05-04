"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV, type SettingsNavItem } from "@/lib/settings/nav-config";
import { cn } from "@/lib/utils";

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // /settings is exact-match — otherwise it would match every nested page.
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  active,
}: {
  item: SettingsNavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const baseClass =
    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors";

  const content = (
    <>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.comingSoon && (
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">
          Soon
        </span>
      )}
    </>
  );

  if (item.disabled) {
    return (
      <div
        aria-disabled="true"
        title={item.comingSoon ? "Coming soon" : undefined}
        className={cn(
          baseClass,
          "text-zinc-500 opacity-50 cursor-not-allowed select-none",
        )}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        baseClass,
        active
          ? "bg-violet-500/10 text-violet-400"
          : "text-zinc-400 hover:text-white hover:bg-white/5",
      )}
    >
      {content}
    </Link>
  );
}

export function SettingsSidenav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: vertical sidenav */}
      <nav
        aria-label="Settings"
        className="hidden md:block w-56 shrink-0 space-y-1 sticky top-4 self-start"
      >
        {SETTINGS_NAV.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}
      </nav>

      {/* Mobile: horizontal scrolling chip rail */}
      <nav
        aria-label="Settings"
        className="md:hidden -mx-4 px-4 mb-4 overflow-x-auto"
      >
        <div className="flex gap-2 w-max">
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            const chipBase =
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors";
            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  aria-disabled="true"
                  title={item.comingSoon ? "Coming soon" : undefined}
                  className={cn(
                    chipBase,
                    "text-zinc-500 border-white/10 opacity-50 cursor-not-allowed",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {item.label}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  chipBase,
                  active
                    ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
                    : "text-zinc-400 border-white/10 hover:text-white hover:bg-white/5",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
