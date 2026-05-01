import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK before any config file imports it. We assert against `init`
// to verify the no-DSN no-op contract: when SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN
// are unset, init must be called with `dsn: undefined`. The Sentry SDK itself
// short-circuits in that case, which is what makes this integration safe to
// merge before the Sentry account is provisioned.
vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  captureRequestError: vi.fn(),
}));

// Resolve config file paths relative to repo root via the project root in the
// test runner's cwd. The three config files live at the project root.
const CLIENT_CONFIG = "../../sentry.client.config";
const SERVER_CONFIG = "../../sentry.server.config";
const EDGE_CONFIG = "../../sentry.edge.config";

describe("sentry config files", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("client config loads without throwing and calls init with undefined dsn when env unset", async () => {
    const Sentry = await import("@sentry/nextjs");
    await expect(import(CLIENT_CONFIG)).resolves.toBeDefined();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = (Sentry.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      dsn?: string;
      replaysSessionSampleRate?: number;
      replaysOnErrorSampleRate?: number;
    };
    expect(opts.dsn).toBeUndefined();
    // Privacy sentinel: replay must not record by default; only on errors.
    expect(opts.replaysSessionSampleRate).toBe(0);
    expect(opts.replaysOnErrorSampleRate).toBeGreaterThan(0);
  });

  it("server config loads without throwing and calls init with undefined dsn when env unset", async () => {
    const Sentry = await import("@sentry/nextjs");
    await expect(import(SERVER_CONFIG)).resolves.toBeDefined();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = (Sentry.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      dsn?: string;
    };
    expect(opts.dsn).toBeUndefined();
  });

  it("edge config loads without throwing and calls init with undefined dsn when env unset", async () => {
    const Sentry = await import("@sentry/nextjs");
    await expect(import(EDGE_CONFIG)).resolves.toBeDefined();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = (Sentry.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      dsn?: string;
    };
    expect(opts.dsn).toBeUndefined();
  });
});
