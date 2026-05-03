import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"

/**
 * Server-side Sentry smoke-test route.
 *
 * Gated by CRON_SECRET so random traffic can't fire it. Throws a tagged
 * Error which `instrumentation.ts#onRequestError` should catch and ship
 * to Sentry. Useful any time you want to verify the server-side capture
 * pipeline is wired up correctly.
 *
 *   curl 'https://<host>/api/__sentry-test?token=<CRON_SECRET>'
 *
 * Expected: HTTP 500 returned to caller; one new event in Sentry with
 * tag `test=server-smoke` within ~30s.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
  }

  const triggeredAt = new Date().toISOString()
  Sentry.setTag("test", "server-smoke")
  Sentry.setContext("smoke_test", {
    triggered_at: triggeredAt,
    purpose: "verify server-side Sentry capture wiring",
    runtime: "nodejs",
  })

  throw new Error(`[sentry-smoke-test] Server-side test fired at ${triggeredAt}`)
}
