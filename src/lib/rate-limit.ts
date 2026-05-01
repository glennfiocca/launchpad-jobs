/**
 * Sliding window rate limiter with pluggable backend.
 *
 * Auto-selects backend at module load:
 * - If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are both set,
 *   uses Upstash Redis (`@upstash/ratelimit`) — required for multi-instance
 *   deployments where the in-memory store can't share state across dynos.
 * - Otherwise falls back to an in-memory sliding window — fine on a single dyno.
 *
 * Both backends implement the same `RateLimitStore` interface so the public
 * `checkRateLimit` function is backend-agnostic.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Stale-entry cleanup cadence for the in-memory store
const CLEANUP_INTERVAL_MS = 60_000;

// Cache key for Upstash limiter instances per (limit, windowMs) bucket
type LimiterKey = string;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

interface RateLimitStore {
  check(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryStore implements RateLimitStore {
  private readonly store = new Map<string, RateLimitEntry>();
  private lastCleanup = Date.now();

  private cleanupStaleEntries(now: number): void {
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    for (const [key, entry] of this.store) {
      if (entry.resetAt <= now) {
        this.store.delete(key);
      }
    }
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    this.cleanupStaleEntries(now);

    const entry = this.store.get(key);

    if (!entry || entry.resetAt <= now) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, limit, remaining: limit - 1, resetAt: now + windowMs };
    }

    if (entry.count < limit) {
      entry.count++;
      return { allowed: true, limit, remaining: limit - entry.count, resetAt: entry.resetAt };
    }

    return { allowed: false, limit, remaining: 0, resetAt: entry.resetAt };
  }
}

class UpstashStore implements RateLimitStore {
  private readonly redis: Redis;
  private readonly limiters = new Map<LimiterKey, Ratelimit>();

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  // One Ratelimit instance per (limit, windowMs) — different tiers share a Redis client.
  private getLimiter(limit: number, windowMs: number): Ratelimit {
    const key: LimiterKey = `${limit}:${windowMs}`;
    const cached = this.limiters.get(key);
    if (cached) return cached;

    const limiter = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      analytics: false,
      prefix: "rate-limit",
    });
    this.limiters.set(key, limiter);
    return limiter;
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const limiter = this.getLimiter(limit, windowMs);
    const res = await limiter.limit(key);
    return {
      allowed: res.success,
      limit: res.limit,
      remaining: res.remaining,
      resetAt: res.reset,
    };
  }
}

function selectStore(): RateLimitStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    console.log("[rate-limit] backend=upstash");
    return new UpstashStore(url, token);
  }

  console.log("[rate-limit] backend=memory");
  return new InMemoryStore();
}

const store: RateLimitStore = selectStore();

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
): Promise<RateLimitResult> {
  return store.check(key, limit, windowMs);
}

/**
 * Get client IP from request headers.
 * Checks x-forwarded-for (DO App Platform sets this), then x-real-ip, then fallback.
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Exposed for tests — allows constructing a fresh store with mocked env/deps.
export const __test__ = {
  InMemoryStore,
  UpstashStore,
  selectStore,
};
