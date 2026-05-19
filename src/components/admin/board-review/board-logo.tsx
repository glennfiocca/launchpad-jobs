"use client"

import { useState } from "react"

interface BoardLogoProps {
  logoUrl: string | null
  name: string
  size?: number
}

/**
 * Large board logo with a monogram fallback. Mirrors the
 * `LogoCell` pattern in admin/logo-overrides but sized up and themed for
 * a hero card. `next/image` would force a remotePatterns config for every
 * board hostname so plain `<img>` with onError is pragmatic.
 */
export function BoardLogo({ logoUrl, name, size = 120 }: BoardLogoProps) {
  const [errored, setErrored] = useState(false)
  const initial = name.charAt(0).toUpperCase() || "?"
  const dim = `${size}px`

  if (!logoUrl || errored) {
    return (
      <div
        className="rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 font-semibold text-3xl shrink-0"
        style={{ width: dim, height: dim }}
        aria-label={`${name} monogram`}
      >
        {initial}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={`${name} logo`}
      className="rounded-xl bg-zinc-800 border border-zinc-700 object-contain shrink-0"
      style={{ width: dim, height: dim }}
      onError={() => setErrored(true)}
    />
  )
}
