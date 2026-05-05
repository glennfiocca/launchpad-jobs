// Minimal structured JSON logger for sync + ops paths.
//
// Goals:
//  - Single-line JSON in production (DigitalOcean log capture is line-based).
//  - Pretty single-line in dev so local runs stay readable.
//  - `child()` for binding ambient context (syncLogId, boardToken, provider)
//    without repeating the fields at every call site.
//
// No external dependency — `pino` is not installed and pulling it in for a
// few sync log lines would be over-engineering.

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  syncLogId?: string;
  boardToken?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

// Map level → console sink. Keeping warn/error on stderr preserves DO's
// existing severity routing; debug/info go to stdout.
const sinks: Record<LogLevel, (line: string) => void> = {
  debug: (line) => console.log(line),
  info: (line) => console.log(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function formatProd(
  ts: string,
  level: LogLevel,
  message: string,
  context: LogContext,
): string {
  // Single JSON line — `ts` and `level` first for grep-ability.
  return JSON.stringify({ ts, level, message, ...context });
}

function formatDev(
  ts: string,
  level: LogLevel,
  message: string,
  context: LogContext,
): string {
  const ctxKeys = Object.keys(context);
  const ctxStr = ctxKeys.length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `[${ts}] ${level.toUpperCase()} ${message}${ctxStr}`;
}

function emit(
  level: LogLevel,
  base: LogContext,
  message: string,
  context?: LogContext,
): void {
  const ts = new Date().toISOString();
  const merged: LogContext = { ...base, ...(context ?? {}) };
  const line = isProd()
    ? formatProd(ts, level, message, merged)
    : formatDev(ts, level, message, merged);
  sinks[level](line);
}

export function createLogger(base: LogContext = {}): Logger {
  // Freeze base so callers can't accidentally mutate the bound context;
  // child() always returns a fresh object via spread.
  const frozen: LogContext = { ...base };

  return {
    debug(message, context) {
      emit("debug", frozen, message, context);
    },
    info(message, context) {
      emit("info", frozen, message, context);
    },
    warn(message, context) {
      emit("warn", frozen, message, context);
    },
    error(message, context) {
      emit("error", frozen, message, context);
    },
    child(context) {
      return createLogger({ ...frozen, ...context });
    },
  };
}

// Default app-wide logger. Most callers will want a child-bound logger,
// but this provides a zero-context starting point.
export const logger: Logger = createLogger();
