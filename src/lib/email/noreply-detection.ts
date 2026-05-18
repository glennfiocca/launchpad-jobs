/**
 * Heuristics for detecting automation / noreply senders. Used by the
 * dashboard's email-thread modal to exclude these addresses as reply
 * targets — the closed-loop reply system only sends to humans.
 *
 * Schema note: `ApplicationEmail` does *not* currently persist a Reply-To
 * header (see prisma/schema.prisma — only `from` / `to` are stored). If we
 * later add `replyTo`, layer it into `pickReplyTarget` with priority over
 * `from`. For now we work purely off the From header.
 */

/**
 * Patterns that match the *local part* of common automation addresses, or
 * the substring "noreply" / "donotreply" anywhere in the address. Tested
 * against the lowercased address string.
 */
const NOREPLY_PATTERNS: ReadonlyArray<RegExp> = [
  /\bno-?reply\b/i,
  /\bdo-?not-?reply\b/i,
  /\bnoreply\b/i,
  /\bdonotreply\b/i,
  /^notifications?@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounce[s+-]?@/i,
  /^automated?@/i,
  /^system@/i,
];

/**
 * Strip the RFC 5322 display-name wrapper from a From-header value:
 *   `"Jane Smith <jane@example.com>"` → `"jane@example.com"`
 *   `"jane@example.com"`              → `"jane@example.com"`
 *
 * Returns null if no plausible address is recoverable.
 */
export function extractAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Prefer the angle-bracketed address when both name + angle form is present.
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle && angle[1]) return angle[1].trim();
  return trimmed;
}

/**
 * Returns true when the address looks like a noreply / automation sender.
 * Null or empty input is treated as noreply (we can't reply to nothing).
 */
export function isNoreplyAddress(addr: string | null | undefined): boolean {
  const address = extractAddress(addr);
  if (!address) return true;
  const lower = address.toLowerCase();
  return NOREPLY_PATTERNS.some((p) => p.test(lower));
}

/**
 * Given an email, decide the best human reply target. Currently sourced
 * purely from `from`; see the file-level comment for the future Reply-To
 * extension.
 *
 * Returns the bare address (display-name stripped) or null.
 */
export function pickReplyTarget(email: {
  from: string | null;
}): string | null {
  const fromAddress = extractAddress(email.from);
  if (fromAddress && !isNoreplyAddress(fromAddress)) return fromAddress;
  return null;
}

/**
 * Given a thread of emails (ordered newest-first), find the most recent
 * human inbound sender we can reply to. Returns null if none exists —
 * the composer surfaces a "waiting for the recruiter" empty state in
 * that case.
 */
export function findReplyRecipient(
  emails: ReadonlyArray<{ direction: string; from: string | null }>,
): string | null {
  for (const e of emails) {
    if (e.direction !== "inbound") continue;
    const target = pickReplyTarget(e);
    if (target) return target;
  }
  return null;
}
