// Next.js calls `register()` once on server boot. We dispatch on the runtime
// env var to load the appropriate Sentry config — Node for the main server,
// Edge for middleware / edge route handlers.
//
// Paths are relative because the Sentry config files live at the repo root
// while this file lives in `src/`.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Forwards Next.js request errors into Sentry. Like the SDK init, this is
// inert when no DSN is configured.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
