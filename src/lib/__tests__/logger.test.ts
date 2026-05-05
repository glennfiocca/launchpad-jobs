import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "@/lib/logger";

// Capture stdout/stderr via console.* spies. Each test starts with fresh
// spies + a known NODE_ENV; restored in afterEach.

// Next.js types declare process.env.NODE_ENV as a readonly literal union, so
// we mutate via a permissive view. Safe inside tests.
const env = process.env as Record<string, string | undefined>;
const ORIGINAL_NODE_ENV = env.NODE_ENV;

interface Spies {
  log: ReturnType<typeof vi.spyOn>;
  warn: ReturnType<typeof vi.spyOn>;
  error: ReturnType<typeof vi.spyOn>;
}

function installSpies(): Spies {
  return {
    log: vi.spyOn(console, "log").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  env.NODE_ENV = ORIGINAL_NODE_ENV;
  vi.restoreAllMocks();
});

describe("logger — production JSON format", () => {
  it("emits one JSON line per call with ts/level/message/context", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const log = createLogger();

    log.info("hello world", { syncLogId: "abc", count: 3 });

    expect(spies.log).toHaveBeenCalledTimes(1);
    const line = spies.log.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("hello world");
    expect(parsed.syncLogId).toBe("abc");
    expect(parsed.count).toBe(3);
    expect(typeof parsed.ts).toBe("string");
    // ISO 8601 sanity: parses to a real date
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
  });

  it("routes warn/error to console.warn/console.error sinks", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const log = createLogger();

    log.warn("careful", { boardToken: "okta" });
    log.error("boom", { provider: "GREENHOUSE" });

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);

    const warnLine = JSON.parse(spies.warn.mock.calls[0]?.[0] as string);
    const errorLine = JSON.parse(spies.error.mock.calls[0]?.[0] as string);
    expect(warnLine.level).toBe("warn");
    expect(warnLine.boardToken).toBe("okta");
    expect(errorLine.level).toBe("error");
    expect(errorLine.provider).toBe("GREENHOUSE");
  });

  it("supports debug level", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const log = createLogger();

    log.debug("trace", { stage: "init" });

    expect(spies.log).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spies.log.mock.calls[0]?.[0] as string);
    expect(parsed.level).toBe("debug");
    expect(parsed.stage).toBe("init");
  });
});

describe("logger — dev pretty format", () => {
  it("emits a single human-readable line in non-production", () => {
    env.NODE_ENV = "development";
    const spies = installSpies();
    const log = createLogger();

    log.info("hi", { syncLogId: "x" });

    const line = spies.log.mock.calls[0]?.[0] as string;
    expect(line).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] INFO hi \{"syncLogId":"x"\}$/,
    );
    // Must not be raw JSON (i.e. shouldn't start with `{`)
    expect(line.startsWith("{")).toBe(false);
  });

  it("omits trailing context when empty", () => {
    env.NODE_ENV = "development";
    const spies = installSpies();
    const log = createLogger();

    log.info("plain");

    const line = spies.log.mock.calls[0]?.[0] as string;
    expect(line).toMatch(/^\[[^\]]+\] INFO plain$/);
  });
});

describe("logger — context binding via child()", () => {
  it("merges base + child + per-call context", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const root = createLogger({ service: "sync" });
    const child = root.child({ syncLogId: "run-1", boardToken: "okta" });

    child.info("board synced", { added: 7 });

    const parsed = JSON.parse(spies.log.mock.calls[0]?.[0] as string);
    expect(parsed.service).toBe("sync");
    expect(parsed.syncLogId).toBe("run-1");
    expect(parsed.boardToken).toBe("okta");
    expect(parsed.added).toBe(7);
  });

  it("child() does not leak context back into the parent logger", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const root = createLogger({ service: "sync" });
    const child = root.child({ syncLogId: "run-1" });

    root.info("from root");
    child.info("from child");

    const rootLine = JSON.parse(spies.log.mock.calls[0]?.[0] as string);
    const childLine = JSON.parse(spies.log.mock.calls[1]?.[0] as string);

    expect(rootLine.syncLogId).toBeUndefined();
    expect(rootLine.service).toBe("sync");
    expect(childLine.syncLogId).toBe("run-1");
    expect(childLine.service).toBe("sync");
  });

  it("per-call context overrides bound context for that call only", () => {
    env.NODE_ENV = "production";
    const spies = installSpies();
    const log = createLogger({ provider: "GREENHOUSE" });

    log.info("override", { provider: "ASHBY" });
    log.info("after");

    const overrideLine = JSON.parse(
      spies.log.mock.calls[0]?.[0] as string,
    );
    const afterLine = JSON.parse(spies.log.mock.calls[1]?.[0] as string);
    expect(overrideLine.provider).toBe("ASHBY");
    expect(afterLine.provider).toBe("GREENHOUSE");
  });
});
