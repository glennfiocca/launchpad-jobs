// Sentry browser SDK init.
//
// CRITICAL: when NEXT_PUBLIC_SENTRY_DSN is unset, `dsn` is `undefined` and
// `Sentry.init` is a no-op — the integration ships disabled by default and
// becomes active only when the env var is configured in production.
//
// Privacy: applicants paste PII (resumes, addresses, EEOC answers) into form
// fields all over this app. `maskAllText` and `blockAllMedia` MUST stay true
// so Session Replay never records any of that content.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
