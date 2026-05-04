"use client";

// Confirmation-prompted "Sign out everywhere" trigger. POSTs to
// /api/account/sessions/all and on 204 calls signOut() to clear the local
// cookie immediately (the server-side tokenVersion bump invalidates other
// browsers within ~60s — the jwt-callback re-check window).

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function SignOutEverywhereButton() {
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    const ok = window.confirm(
      "Sign out of all browsers and devices? You'll need to sign in again everywhere.",
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/account/sessions/all", {
        method: "POST",
      });
      if (res.status !== 204) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Failed to sign out everywhere");
      }
      // Local cookie clear + redirect — instant signout for THIS browser.
      // Other tabs/devices fall off within ~60s via the tokenVersion check.
      await signOut({
        callbackUrl: "/auth/signin?reason=signed_out_everywhere",
      });
    } catch (err) {
      console.error("[sign-out-everywhere] failed:", err);
      toast.error(err instanceof Error ? err.message : "Sign-out failed");
      setSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="inline-flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 hover:bg-red-950/50 disabled:opacity-50 disabled:cursor-not-allowed text-red-200 text-sm font-medium px-3 py-2 transition-colors"
    >
      {submitting ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LogOut className="w-3.5 h-3.5" />
      )}
      {submitting ? "Signing out…" : "Sign out everywhere"}
    </button>
  );
}
