"use client";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-indigo-500/20 text-indigo-300",
  "bg-violet-500/20 text-violet-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-amber-500/20 text-amber-300",
] as const;

function getInitials(name: string): string {
  const clean = name.replace(/<[^>]+>/, "").trim();
  if (clean.includes("@")) return clean[0].toUpperCase();
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function getAvatarColor(name: string): string {
  const hash = Array.from(name).reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) & 0xffff,
    0
  );
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function SenderAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizeClass = size === "sm" ? "w-7 h-7 text-xs" : "w-9 h-9 text-sm";
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold shrink-0",
        sizeClass,
        getAvatarColor(name),
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
