/**
 * Canonical company-name resolver.
 *
 * Resolution order:
 *   1. Curated override map keyed by `(provider, slug)` — wins unconditionally.
 *   2. Caller-supplied name, if it already looks well-formed.
 *   3. Heuristic title-case of the supplied name.
 *   4. Heuristic title-case of the slug, as a last resort.
 *
 * The resolver is sync, deterministic, and side-effect free. It is safe to
 * call from sync hot paths and from backfill scripts alike.
 */

import type { AtsProvider } from "@prisma/client";
import { lookupOverride } from "./overrides";
import { looksMalformed, normalizeName } from "./normalize";

export interface ResolveInput {
  provider: AtsProvider;
  slug: string;
  rawName?: string | null;
}

export interface ResolveResult {
  name: string;
  source: "override" | "raw" | "normalized" | "slug";
}

export function resolveCompanyName(input: ResolveInput): ResolveResult {
  const { provider, slug, rawName } = input;

  const override = lookupOverride(provider, slug);
  if (override) return { name: override, source: "override" };

  const trimmed = (rawName ?? "").trim();
  if (trimmed && !looksMalformed(trimmed)) {
    return { name: trimmed, source: "raw" };
  }

  if (trimmed) {
    return { name: normalizeName(trimmed), source: "normalized" };
  }

  // Last-resort: derive from the slug. Strip provider prefix first.
  const bareSlug = slug.replace(/^[a-z]+-/, "");
  return { name: normalizeName(bareSlug), source: "slug" };
}
