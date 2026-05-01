// Sentry server (Node runtime) SDK init.
// No-op when SENTRY_DSN is unset — see sentry.client.config.ts for context.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
