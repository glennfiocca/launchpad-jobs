/**
 * In-memory sliding window rate limiter.
 *
 * Keys requests by IP (public) or user ID (authenticated).
 * Uses a fixed-window counter with automatic cleanup of stale entries.
 *
 * Suitable for single-instance deployments (DO App Platform).
 * For multi-instance, swap to Upstash Redis.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 60 seconds to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupStaleEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check and consume a rate limit token.
 *
 * @param key - Unique identifier (e.g. "ip:1.2.3.4" or "user:abc123")
 * @param limit - Max requests per window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanupStaleEntries();

  const now = Date.now();
  const entry = store.get(key);

  // No existing entry or window expired — start fresh
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit, remaining: limit - 1, resetAt: now + windowMs };
  }

  // Within window — check count
  if (entry.count < limit) {
    entry.count++;
    return { allowed: true, limit, remaining: limit - entry.count, resetAt: entry.resetAt };
  }

  // Rate limited
  return { allowed: false, limit, remaining: 0, resetAt: entry.resetAt };
}

/**
 * Get client IP from request headers.
 * Checks x-forwarded-for (DO App Platform sets this), then x-real-ip, then fallback.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for may contain multiple IPs; first is the client
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
