"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Brand-safe background colors for the initials placeholder.
// Color is derived deterministically from the company name.
const PLACEHOLDER_COLORS = [
  "bg-indigo-500/20 text-indigo-300",
  "bg-blue-500/20 text-blue-300",
  "bg-violet-500/20 text-violet-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-rose-500/20 text-rose-300",
  "bg-amber-500/20 text-amber-300",
  "bg-cyan-500/20 text-cyan-300",
  "bg-pink-500/20 text-pink-300",
] as const;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function getPlaceholderColor(name: string): string {
  const hash = Array.from(name).reduce(
    (acc, char) => (acc * 31 + char.charCodeAt(0)) & 0xffff,
    0
  );
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length];
}

function getLogoUrl(website: string): string | null {
  try {
    const hostname = new URL(website).hostname;
    return `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${hostname}&size=128`;
  } catch {
    return null;
  }
}

interface CompanyLogoProps {
  name: string;
  logoUrl: string | null;
  website?: string | null;
  className?: string;
}

/**
 * Renders a company logo with a three-tier fallback:
 *   1. logoUrl (stored value)
 *   2. Google gstatic favicon API derived from company website
 *   3. Initials placeholder with a deterministic brand-safe color
 */
export function CompanyLogo({ name, logoUrl, website, className }: CompanyLogoProps) {
  const faviconUrl = !logoUrl && website ? getLogoUrl(website) : null;
  const initialSrc = logoUrl ?? faviconUrl ?? null;

  const [src, setSrc] = useState<string | null>(initialSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const newSrc = logoUrl ?? (website ? getLogoUrl(website) : null);
    setSrc(newSrc);
    setFailed(false);
  }, [logoUrl, website]);

  const handleError = () => {
    if (src === logoUrl && faviconUrl) {
      // logoUrl failed — try Google favicon
      setSrc(faviconUrl);
    } else {
      // Google favicon (or logoUrl with no favicon fallback) failed — show initials
      setFailed(true);
    }
  };

  if (!failed && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={cn("w-full h-full object-cover", className)}
        onError={handleError}
      />
    );
  }

  // Initials placeholder
  const initials = getInitials(name);
  const colorClass = getPlaceholderColor(name);
  return (
    <span className={cn("w-full h-full flex items-center justify-center font-bold text-sm", colorClass, className)}>
      {initials}
    </span>
  );
}
