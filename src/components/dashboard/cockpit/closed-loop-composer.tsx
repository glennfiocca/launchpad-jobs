"use client";

/**
 * ClosedLoopComposer — the footer composer for EmailThreadModal.
 *
 * Constraints (Phase 3 locked decisions, see CLAUDE_CODE_PROMPT.md):
 *   1. No compose-new affordance — replies only inside an existing thread.
 *   2. Recipient is implicit, derived from the thread via
 *      findReplyRecipient(); user cannot type addresses.
 *   3. No From / Subject inputs — From is the application's trackingEmail
 *      (server-side), Subject is inherited from the latest message (with
 *      "Re: " prepended if needed).
 *   4. If no human has emailed yet, the composer is disabled with a
 *      one-liner empty state.
 *   5. 5-second Gmail-style undo countdown after Send is clicked. The
 *      actual POST only fires when the countdown elapses untouched.
 *      Closing the modal mid-countdown cancels and discards the draft.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { ApplicationEmail } from "@prisma/client";

import { cn } from "@/lib/utils";
import type { ApiResponse } from "@/types";
import { findReplyRecipient } from "@/lib/email/noreply-detection";

const UNDO_SECONDS = 5;
const MAX_BODY_LENGTH = 10_000;

interface ClosedLoopComposerProps {
  applicationId: string;
  /** Newest-first list of thread emails. */
  emails: ApplicationEmail[];
  /** True while the parent is still loading / has no data. */
  disabled: boolean;
  /** Parent's open state — used to cancel pending sends on close. */
  modalOpen: boolean;
  /** Called after a successful send so the parent can splice the email
   *  into the thread without a refetch. */
  onSent: (newEmail: ApplicationEmail) => void;
}

type ComposerPhase =
  | { kind: "writing" }
  | { kind: "queued"; remaining: number }
  | { kind: "sending" }
  | { kind: "error"; message: string };

/** Re: prefix the subject unless it already starts with one. */
function deriveReplySubject(latestSubject: string | undefined): string {
  if (!latestSubject || latestSubject.trim() === "") return "Re: (no subject)";
  return /^re:\s*/i.test(latestSubject) ? latestSubject : `Re: ${latestSubject}`;
}

export function ClosedLoopComposer({
  applicationId,
  emails,
  disabled,
  modalOpen,
  onSent,
}: ClosedLoopComposerProps) {
  const [body, setBody] = useState<string>("");
  const [phase, setPhase] = useState<ComposerPhase>({ kind: "writing" });
  // Hold a ref to the active countdown so we can cancel from effects.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const recipient = findReplyRecipient(emails);
  const latestSubject = emails[0]?.subject;
  const subject = deriveReplySubject(latestSubject);

  // ── Cleanup any pending timer when the modal closes ────────────────
  useEffect(() => {
    if (modalOpen) return;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // If a send was queued, surface the cancel toast and drop the draft.
    if (phase.kind === "queued") {
      toast("Reply cancelled (closed)");
    }
    // Reset local state so reopening the modal starts fresh.
    setPhase({ kind: "writing" });
    setBody("");
    // We intentionally only react to modalOpen changes — `phase` is captured
    // by ref via closure, and depending on it would re-fire the cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  // ── Drive the countdown when in "queued" phase ─────────────────────
  useEffect(() => {
    if (phase.kind !== "queued") return;

    timerRef.current = setInterval(() => {
      setPhase((prev) => {
        if (prev.kind !== "queued") return prev;
        const next = prev.remaining - 1;
        if (next <= 0) {
          // Stop the timer; sendNow() will fire from the effect below.
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return { kind: "sending" };
        }
        return { kind: "queued", remaining: next };
      });
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase.kind]);

  // ── Fire the POST when phase transitions to "sending" ──────────────
  useEffect(() => {
    if (phase.kind !== "sending") return;
    if (!recipient) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/applications/${applicationId}/emails/send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: recipient, subject, body }),
          },
        );
        const json = (await res.json()) as ApiResponse<ApplicationEmail>;
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          // Preserve the draft so the user can retry without retyping.
          setPhase({
            kind: "error",
            message: json.error ?? "Failed to send reply.",
          });
          return;
        }
        onSent(json.data);
        setBody("");
        setPhase({ kind: "writing" });
        toast.success("Reply sent");
      } catch {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message: "Network error. Try again.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `subject` and `body` are intentionally captured at the time the effect
    // fires; if the user keeps typing during the (instant) sending window
    // that's still the message they queued.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, recipient, applicationId, onSent]);

  // ── Disabled / waiting state ───────────────────────────────────────
  if (disabled) {
    return (
      <div
        className={cn(
          "px-4 py-3 rounded-xl border border-dashed border-white/10",
          "text-[12.5px] text-text-dim text-center italic",
        )}
      >
        Loading thread…
      </div>
    );
  }

  if (!recipient) {
    return (
      <div
        className={cn(
          "px-4 py-3 rounded-xl border border-dashed border-white/10",
          "text-[12.5px] text-text-muted text-center",
        )}
      >
        Waiting for the recruiter to reach out — you&rsquo;ll be able to reply
        here once they do.
      </div>
    );
  }

  // ── Queued / undo window ───────────────────────────────────────────
  if (phase.kind === "queued") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02]",
          "flex items-center justify-between gap-4",
        )}
      >
        <span className="text-[13px] text-text">
          Sending in <span className="font-mono tabular-nums">{phase.remaining}</span>
          …
        </span>
        <button
          type="button"
          onClick={handleUndo}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md",
            "bg-white text-black font-semibold text-[12px]",
            "hover:bg-zinc-100 transition-colors",
          )}
        >
          <Undo2 className="w-3 h-3" />
          Undo
        </button>
      </div>
    );
  }

  // ── Writing / sending / error ──────────────────────────────────────
  const sending = phase.kind === "sending";
  const errorMessage = phase.kind === "error" ? phase.message : null;
  const charsLeft = MAX_BODY_LENGTH - body.length;
  const canSend = body.trim().length > 0 && !sending;

  function handleSendClick(): void {
    if (!canSend) return;
    setPhase({ kind: "queued", remaining: UNDO_SECONDS });
  }

  function handleUndo(): void {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase({ kind: "writing" });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Reply-to address (static, non-editable) */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-dim">
        <span>Reply to:</span>
        <span className="text-text-muted truncate">{recipient}</span>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY_LENGTH))}
        disabled={sending}
        rows={6}
        placeholder="Write your reply…"
        className={cn(
          "bg-black border border-white/10 rounded-xl text-white",
          "placeholder:text-zinc-600 px-3 py-2 text-[13.5px] w-full resize-y",
          "focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20",
          "disabled:opacity-60",
        )}
      />

      {errorMessage && (
        <p className="text-[12px] text-rose-300/90">{errorMessage}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10.5px] text-text-dim tabular-nums">
          {body.length.toLocaleString()} / {MAX_BODY_LENGTH.toLocaleString()}
          {charsLeft < 200 && charsLeft >= 0 && (
            <span className="text-amber-300/80"> · {charsLeft} left</span>
          )}
        </span>
        <button
          type="button"
          onClick={handleSendClick}
          disabled={!canSend}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl",
            "bg-white text-black font-semibold text-[12px]",
            "hover:bg-zinc-100 transition-colors",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <Send className="w-3 h-3" />
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
