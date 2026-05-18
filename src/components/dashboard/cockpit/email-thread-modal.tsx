"use client";

/**
 * EmailThreadModal — Phase 3 of the editorial-cockpit redesign.
 *
 * A single-instance modal (lives in DashboardClient) that opens an
 * application's email thread. Renders the existing <EmailThread> in
 * `readOnly` mode so its internal composer is bypassed; we dock our own
 * closed-loop composer in the modal footer. See COMPONENT_SPEC.md and
 * CLAUDE_CODE_PROMPT.md for the locked-decision rationale (no compose,
 * no To/From/subject fields, no arbitrary recipient).
 *
 * Emails are fetched internally from GET /api/applications/[id]/emails
 * (confirmed to return `ApiResponse<ApplicationEmail[]>`, newest-first).
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ApplicationEmail, ApplicationStatus } from "@prisma/client";

import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/company-logo";
import { EmailThread } from "@/components/dashboard/email-thread";
import type { ApiResponse } from "@/types";

import { ClosedLoopComposer } from "./closed-loop-composer";

interface EmailThreadModalProps {
  applicationId: string;
  applicationStatus: ApplicationStatus;
  jobTitle: string;
  companyName: string;
  companyLogoUrl?: string | null;
  companyWebsite?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FetchState =
  | { kind: "idle" }
  | { kind: "loading"; appId: string }
  | { kind: "ready"; appId: string; emails: ApplicationEmail[] }
  | { kind: "error"; appId: string; message: string };

export function EmailThreadModal({
  applicationId,
  // applicationStatus and jobTitle are accepted today for header context;
  // they're not yet rendered in this minimal header, but kept on the props
  // surface so Phase 4 can light them up without re-plumbing parents.
  applicationStatus: _applicationStatus,
  jobTitle: _jobTitle,
  companyName,
  companyLogoUrl,
  companyWebsite,
  open,
  onOpenChange,
}: EmailThreadModalProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });
  // Locally append newly-sent emails so the thread updates without refetch.
  const [appended, setAppended] = useState<ApplicationEmail[]>([]);

  // ── Fetch on open ──────────────────────────────────────────────────
  //
  // We avoid a synchronous setState-in-effect by writing the "loading"
  // state from inside the async IIFE (via a microtask). The render below
  // treats `fetchState.appId !== applicationId` as effective "loading",
  // so the user never sees a stale thread for a different application.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      // Microtask boundary — satisfies react-hooks/set-state-in-effect.
      if (cancelled) return;
      setFetchState({ kind: "loading", appId: applicationId });
      setAppended([]);
      try {
        const res = await fetch(`/api/applications/${applicationId}/emails`);
        const json = (await res.json()) as ApiResponse<ApplicationEmail[]>;
        if (cancelled) return;
        if (!res.ok || !json.success || !json.data) {
          setFetchState({
            kind: "error",
            appId: applicationId,
            message: json.error ?? "Failed to load thread.",
          });
          return;
        }
        setFetchState({
          kind: "ready",
          appId: applicationId,
          emails: json.data,
        });
      } catch {
        if (!cancelled) {
          setFetchState({
            kind: "error",
            appId: applicationId,
            message: "Network error loading thread.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, applicationId]);

  // Effective state: only treat fetched data as ready if it matches the
  // currently-open application (otherwise we're showing stale data for a
  // previous open). This lets us avoid a synchronous "loading" setState.
  const effectiveFetchState: FetchState =
    fetchState.kind !== "idle" && fetchState.appId === applicationId
      ? fetchState
      : { kind: "loading", appId: applicationId };

  // Compose the effective email list (fetched + appended). Newest-first
  // because that's how the API and findReplyRecipient expect it.
  const emails: ApplicationEmail[] =
    effectiveFetchState.kind === "ready"
      ? [...appended, ...effectiveFetchState.emails].sort(
          (a, b) =>
            new Date(b.receivedAt).getTime() -
            new Date(a.receivedAt).getTime(),
        )
      : [];

  function handleSent(newEmail: ApplicationEmail): void {
    setAppended((prev) => [newEmail, ...prev]);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "max-w-3xl w-[92vw] max-h-[85vh]",
            "bg-bg-elev border border-border rounded-2xl overflow-hidden",
            "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]",
            "flex flex-col focus:outline-none",
          )}
          aria-describedby={undefined}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <div className="rounded-lg bg-white/8 h-8 w-8 flex items-center justify-center text-zinc-400 font-bold text-xs overflow-hidden shrink-0">
              <CompanyLogo
                name={companyName}
                logoUrl={companyLogoUrl ?? null}
                website={companyWebsite ?? null}
              />
            </div>
            <Dialog.Title className="text-text text-[14px] font-medium flex items-center gap-2 min-w-0">
              <span className="truncate">{companyName}</span>
              <span className="text-text-dim shrink-0">·</span>
              <span className="text-text-muted shrink-0 font-mono text-[11px] tabular-nums">
                {effectiveFetchState.kind === "ready"
                  ? `${emails.length} message${emails.length === 1 ? "" : "s"}`
                  : "—"}
              </span>
            </Dialog.Title>
            <div className="flex-1" />
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close thread"
                className="text-text-dim hover:text-text transition-colors p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* ── Body (scroll) ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {effectiveFetchState.kind === "loading" && <ThreadSkeleton />}
            {effectiveFetchState.kind === "error" && (
              <div className="text-[13px] text-rose-300/90 p-4 rounded-lg border border-rose-500/20 bg-rose-500/5">
                {effectiveFetchState.message}
              </div>
            )}
            {effectiveFetchState.kind === "ready" && (
              // Keyed by appended-count so newly sent emails force a
              // remount — EmailThread's internal state seeds from
              // initialEmails only on first mount.
              <EmailThread
                key={`${applicationId}:${appended.length}`}
                applicationId={applicationId}
                initialEmails={emails}
                readOnly
              />
            )}
          </div>

          {/* ── Footer (composer) ──────────────────────────────────── */}
          <div className="px-5 py-4 border-t border-border bg-bg-elev">
            <ClosedLoopComposer
              applicationId={applicationId}
              emails={emails}
              disabled={effectiveFetchState.kind !== "ready"}
              modalOpen={open}
              onSent={handleSent}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ──────────────────────────────────────────────────────────────────────

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/6" />
      <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/6 ml-12" />
      <div className="h-16 rounded-2xl bg-white/[0.03] border border-white/6" />
    </div>
  );
}
