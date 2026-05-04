"use client";

// Once-per-browser-session ping that records a one-way `gpcOptOut: true` on
// the authenticated user when the browser's GPC signal is on. Pure side
// effect — renders nothing. Errors are intentionally swallowed: this is a
// best-effort persistence of a legal opt-out signal that the server already
// honors at request time.
//
// Mounted inside the authed dashboard layout because (a) it's the smallest
// boundary that guarantees a session exists and (b) the request will carry
// `Sec-GPC: 1` from the same browser context that sets `navigator.globalPrivacyControl`.

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useGpc } from "@/lib/gpc/use-gpc";

const STORAGE_KEY = "pipeline_gpc_pinged";

export function GpcPinger(): null {
  const { data: session } = useSession();
  const gpc = useGpc();

  useEffect(() => {
    if (!session?.user) return;
    if (gpc !== true) return;
    if (typeof window === "undefined") return;

    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") return;
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage may throw in privacy modes — proceed without dedup.
    }

    void fetch("/api/account/gpc-opt-out", { method: "POST" }).catch(() => {
      // Silently swallow — server-side honoring is independent of this ping.
    });
  }, [session?.user, gpc]);

  return null;
}
