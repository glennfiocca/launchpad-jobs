import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock @upstash/ratelimit + @upstash/redis ─────────────────────────────────
const limitMock = vi.fn();
const ratelimitCtor = vi.fn();
const slidingWindowMock = vi.fn(() => ({ __algo: "slidingWindow" }));
const redisCtor = vi.fn();

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = slidingWindowMock;
    constructor(config: unknown) {
      ratelimitCtor(config);
    }
    limit = limitMock;
  }
  return { Ratelimit };
});

vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(config: unknown) {
      redisCtor(config);
    }
  }
  return { Redis };
});

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

async function loadModule() {
  vi.resetModules();
  return await import("../rate-limit");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = ORIGINAL_ENV;
});

describe("backend selection", () => {
  it("selects in-memory backend when Upstash env vars are absent", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const mod = await loadModule();

    expect(logSpy).toHaveBeenCalledWith("[rate-limit] backend=memory");
    expect(redisCtor).not.toHaveBeenCalled();
    await mod.checkRateLimit("k", 5, 1000);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("selects Upstash backend when both UPSTASH env vars are set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-abc";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await loadModule();

    expect(logSpy).toHaveBeenCalledWith("[rate-limit] backend=upstash");
    expect(redisCtor).toHaveBeenCalledWith({
      url: "https://example.upstash.io",
      token: "token-abc",
    });
  });

  it("falls back to in-memory if only one Upstash env var is set", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await loadModule();

    expect(logSpy).toHaveBeenCalledWith("[rate-limit] backend=memory");
    expect(redisCtor).not.toHaveBeenCalled();
  });
});

describe("in-memory backend", () => {
  it("allows requests under the limit and decrements remaining", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();

    const r1 = await mod.checkRateLimit("user:a", 3, 1000);
    const r2 = await mod.checkRateLimit("user:a", 3, 1000);
    const r3 = await mod.checkRateLimit("user:a", 3, 1000);

    expect(r1).toMatchObject({ allowed: true, limit: 3, remaining: 2 });
    expect(r2).toMatchObject({ allowed: true, limit: 3, remaining: 1 });
    expect(r3).toMatchObject({ allowed: true, limit: 3, remaining: 0 });
  });

  it("blocks requests over the limit within the window", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();

    await mod.checkRateLimit("user:b", 2, 1000);
    await mod.checkRateLimit("user:b", 2, 1000);
    const blocked = await mod.checkRateLimit("user:b", 2, 1000);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window elapses (sliding window)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const mod = await loadModule();

    await mod.checkRateLimit("user:c", 1, 1000);
    const blocked = await mod.checkRateLimit("user:c", 1, 1000);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(1500);

    const reopened = await mod.checkRateLimit("user:c", 1, 1000);
    expect(reopened.allowed).toBe(true);
    expect(reopened.remaining).toBe(0);

    vi.useRealTimers();
  });

  it("isolates state per key", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();

    await mod.checkRateLimit("user:x", 1, 1000);
    const xBlocked = await mod.checkRateLimit("user:x", 1, 1000);
    const yAllowed = await mod.checkRateLimit("user:y", 1, 1000);

    expect(xBlocked.allowed).toBe(false);
    expect(yAllowed.allowed).toBe(true);
  });

  it("returns a resetAt in the future", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();

    const before = Date.now();
    const r = await mod.checkRateLimit("user:t", 5, 5000);
    expect(r.resetAt).toBeGreaterThanOrEqual(before + 5000 - 50);
    expect(r.resetAt).toBeLessThanOrEqual(before + 5000 + 50);
  });
});

describe("Upstash adapter", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-abc";
  });

  it("calls .limit(key) on the Ratelimit instance and maps the response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    limitMock.mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 7,
      reset: 1234567890,
    });

    const mod = await loadModule();
    const result = await mod.checkRateLimit("ip:1.2.3.4", 10, 60_000);

    expect(limitMock).toHaveBeenCalledWith("ip:1.2.3.4");
    expect(result).toEqual({
      allowed: true,
      limit: 10,
      remaining: 7,
      resetAt: 1234567890,
    });
  });

  it("maps a denied response to allowed=false", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    limitMock.mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: 9999999,
    });

    const mod = await loadModule();
    const result = await mod.checkRateLimit("ip:9.9.9.9", 10, 60_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.resetAt).toBe(9999999);
  });

  it("constructs Ratelimit.slidingWindow with the requested limit and window", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    limitMock.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: 1 });

    const mod = await loadModule();
    await mod.checkRateLimit("k", 30, 60_000);

    expect(slidingWindowMock).toHaveBeenCalledWith(30, "60000 ms");
  });

  it("reuses the same Ratelimit instance for the same (limit, windowMs)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    limitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1 });

    const mod = await loadModule();
    await mod.checkRateLimit("a", 5, 1000);
    await mod.checkRateLimit("b", 5, 1000);
    await mod.checkRateLimit("c", 5, 1000);

    expect(redisCtor).toHaveBeenCalledTimes(1);
    expect(ratelimitCtor).toHaveBeenCalledTimes(1);
  });

  it("creates a new Ratelimit instance per distinct (limit, windowMs) bucket", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    limitMock.mockResolvedValue({ success: true, limit: 1, remaining: 0, reset: 1 });

    const mod = await loadModule();
    await mod.checkRateLimit("a", 5, 1000);
    await mod.checkRateLimit("b", 10, 1000);
    await mod.checkRateLimit("c", 5, 2000);

    expect(ratelimitCtor).toHaveBeenCalledTimes(3);
  });
});

describe("getClientIp", () => {
  function makeReq(headers: Record<string, string | null>) {
    return {
      headers: {
        get(name: string) {
          return headers[name] ?? null;
        },
      },
    };
  }

  it("prefers x-forwarded-for, taking the first IP", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();
    const ip = mod.getClientIp(
      makeReq({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" })
    );
    expect(ip).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();
    const ip = mod.getClientIp(makeReq({ "x-real-ip": "9.9.9.9" }));
    expect(ip).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no headers are present", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await loadModule();
    const ip = mod.getClientIp(makeReq({}));
    expect(ip).toBe("unknown");
  });
});
