"use client";

/**
 * AppRow — collapsed-by-default application row that expands inline when
 * clicked. Mirrors the prototype's AppRowA (direction-a.jsx :300-437).
 *
 * Collapsed body: company logo + two-line meta + StatusPill + chevron.
 * Expanded body: latest message (left) + journey timeline (right) +
 * action row (Reply / Open thread / Withdraw) and an optional pending-Q
 * strip when the application has unanswered ATS questions.
 *
 * Reply and "Open thread" are intentionally no-op stubs in Phase 2 — Phase
 * 3 will wire them to the upcoming EmailThreadModal. Withdraw is fully
 * wired against PATCH/DELETE /api/applications/[id] using the same
 * inline-confirm state machine as application-detail.tsx.
 */

import { useState } from "react";
import Link from "next/link";
import { cn, timeAgo } from "@/lib/utils";
import { CompanyLogo } from "@/components/company-logo";
import type { ApplicationWithDashboardData, ApplicationWithJob } from "@/types";
import { BTN_PRIMARY, BTN_GHOST, SeparatorDot } from "./atoms";
import { StatusPill } from "./status-pill";
import { JourneyTimeline, type JourneyEntry } from "./journey-timeline";

interface AppRowProps {
  app: ApplicationWithDashboardData;
  open: boolean;
  onToggle: () => void;
  onWithdrawn?: (updated: ApplicationWithJob) => void;
}

type WithdrawState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

const TERMINAL_STATUSES: ReadonlyArray<string> = [
  "WITHDRAWN",
  "LISTING_REMOVED",
  "REJECTED",
  "OFFER",
];

/** Truncate a message body for the inline preview. */
function previewBody(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 200) return trimmed;
  return trimmed.slice(0, 200).trimEnd() + "…";
}

/** publicId fallback — Phase 2 uses the first 8 chars of the application id. */
function publicId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export function AppRow({ app, open, onToggle, onWithdrawn }: AppRowProps) {
  const [withdrawState, setWithdrawState] = useState<WithdrawState>({
    kind: "idle",
  });

  const latestEmail = app.emails[0] ?? null;
  const isTerminal = TERMINAL_STATUSES.includes(app.status);

  // Server fetch sorts statusHistory DESC; the timeline reads oldest -> newest.
  const journey: ReadonlyArray<JourneyEntry> = [...app.statusHistory]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((h) => ({
      id: h.id,
      toStatus: h.toStatus,
      createdAt: h.createdAt,
      triggeredBy: h.triggeredBy,
    }));

  async function handleWithdraw(): Promise<void> {
    setWithdrawState({ kind: "submitting" });
    try {
      const res = await fetch(`/api/applications/${app.id}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: ApplicationWithJob;
        error?: string;
      };
      if (json.success && json.data) {
        onWithdrawn?.(json.data);
        setWithdrawState({ kind: "idle" });
      } else {
        setWithdrawState({
          kind: "error",
          message: json.error ?? "Failed to withdraw application.",
        });
      }
    } catch {
      setWithdrawState({
        kind: "error",
        message: "Network error. Please try again.",
      });
    }
  }

  return (
    <div
      className={cn(
        "bg-bg-chart rounded-[14px] overflow-hidden transition-[border-color] duration-200 border",
        // from prototype direction-a.jsx :304 — active border is lavender 25%
        open ? "border-[rgba(196,181,253,0.25)]" : "border-border",
      )}
    >
      {/* ── Collapsed-state header (always rendered, acts as toggle) ─────── */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-[18px] py-[14px] bg-transparent border-none flex items-center gap-4 cursor-pointer text-left hover:bg-white/[0.015] transition-colors"
      >
        {/* Company logo — 40px tile per COMPONENT_SPEC.md */}
        <div className="rounded-lg bg-white/8 h-10 w-10 flex items-center justify-center text-zinc-400 font-bold text-sm overflow-hidden shrink-0">
          <CompanyLogo
            name={app.job.company.name}
            logoUrl={app.job.company.logoUrl}
            website={app.job.company.website}
          />
        </div>

        {/* Middle column */}
        <div className="flex-1 min-w-0">
          {/* Top: company + publicId */}
          <div className="flex items-baseline gap-[10px]">
            <span className="text-text-muted text-[13px] truncate">
              {app.job.company.name}
            </span>
            <span className="font-mono text-[10px] text-[#52525b] tracking-[0.02em] shrink-0">
              {publicId(app.id)}
            </span>
          </div>
          {/* Job title */}
          <div className="text-text font-display font-medium text-[17px] tracking-[-0.01em] mt-[2px] truncate">
            {app.job.title}
          </div>
          {/* Meta line */}
          <div className="mt-[5px] flex items-center gap-[14px] font-mono text-[11px] text-text-dim flex-wrap">
            <span>{app.job.location ?? "—"}</span>
            <SeparatorDot />
            <span>Applied {timeAgo(app.appliedAt)}</span>
            {app._count.emails > 0 && latestEmail && (
              <>
                <SeparatorDot />
                <span>
                  {app._count.emails} message
                  {app._count.emails === 1 ? "" : "s"} · last reply{" "}
                  {timeAgo(latestEmail.receivedAt)}
                </span>
              </>
            )}
            {app.pendingQuestionsCount > 0 && (
              <>
                <SeparatorDot />
                <span className="text-[var(--color-stage-interview-accent)]">
                  ● {app.pendingQuestionsCount} pending Q
                  {app.pendingQuestionsCount === 1 ? "" : "s"}
                </span>
              </>
            )}
          </div>
        </div>

        <StatusPill status={app.status} />

        {/* Chevron — rotates 90deg when open */}
        <span
          aria-hidden
          className={cn(
            "text-[#52525b] text-[14px] transition-transform duration-200 shrink-0",
            open && "rotate-90",
          )}
          style={{ display: "inline-block" }}
        >
          ›
        </span>
      </button>

      {/* ── Expanded body ───────────────────────────────────────────────── */}
      {open && (
        <div
          // pl-[74px] = 40 logo + 16 gap + 18 container pad — keeps the body
          // aligned with the post-logo content column above.
          className="px-[18px] pb-[18px] pl-[74px] grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-dashed border-white/6 mt-1"
        >
          {/* ── Left column: latest activity ───────────────────────────── */}
          <div className="pt-4">
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-text-dim mb-2">
              Latest activity
            </div>

            {latestEmail ? (
              <div className="p-[14px] rounded-[10px] bg-white/[0.02] border border-white/6">
                <div className="flex items-center justify-between mb-[6px] gap-2">
                  <span className="font-mono text-[11px] text-text-muted truncate">
                    {latestEmail.from}
                  </span>
                  <span className="font-mono text-[11px] text-[#52525b] shrink-0">
                    {timeAgo(latestEmail.receivedAt)}
                  </span>
                </div>
                <div className="text-text text-[13.5px] leading-[1.55]">
                  {previewBody(latestEmail.body)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    onClick={() => {
                      /* TODO: Phase 3 — EmailThreadModal */
                    }}
                  >
                    Reply
                  </button>
                  <button
                    type="button"
                    className={BTN_GHOST}
                    onClick={() => {
                      /* TODO: Phase 3 — EmailThreadModal */
                    }}
                  >
                    Open thread
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-[14px] rounded-[10px] bg-white/[0.02] border border-dashed border-white/6 text-text-dim text-[13px]">
                No messages yet — usually 1–2 weeks until first reply.
              </div>
            )}

            {/* Pending Q strip */}
            {app.pendingQuestionsCount > 0 && (
              <div className="mt-[10px] px-3 py-[10px] rounded-[10px] bg-[rgba(217,70,239,0.06)] border border-[rgba(217,70,239,0.18)] flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[12.5px] text-[var(--color-stage-interview-accent)]">
                  <strong className="text-[#fae8ff] font-semibold">
                    {app.pendingQuestionsCount} question
                    {app.pendingQuestionsCount === 1 ? "" : "s"}
                  </strong>{" "}
                  waiting · {app.job.company.name}
                </div>
                <Link
                  href={`/applications/${app.id}/questions`}
                  className={cn(
                    BTN_PRIMARY,
                    "no-underline bg-[var(--color-stage-interview)] hover:bg-[var(--color-stage-interview-accent)]",
                  )}
                >
                  Answer →
                </Link>
              </div>
            )}
          </div>

          {/* ── Right column: journey timeline + action links ──────────── */}
          <div className="pt-4">
            <div className="font-mono text-[10px] tracking-[0.06em] uppercase text-text-dim mb-2">
              Journey
            </div>
            <JourneyTimeline entries={journey} />

            <div className="mt-[14px] flex gap-[10px] font-mono text-[11px] items-center flex-wrap">
              <Link
                href={`/jobs?job=${encodeURIComponent(
                  app.job.publicJobId ?? app.job.id,
                )}`}
                className="text-accent-light hover:text-text transition-colors no-underline"
              >
                View job ↗
              </Link>

              {!isTerminal && (
                <>
                  <SeparatorDot />
                  {withdrawState.kind === "idle" && (
                    <button
                      type="button"
                      onClick={() =>
                        setWithdrawState({ kind: "confirming" })
                      }
                      className="text-[#fb7185] hover:text-rose-300 transition-colors bg-transparent border-none cursor-pointer p-0 font-mono text-[11px]"
                    >
                      Withdraw
                    </button>
                  )}

                  {withdrawState.kind === "confirming" && (
                    <>
                      <span className="text-text-dim">
                        This is final — confirm?
                      </span>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        className="text-[#fb7185] hover:text-rose-300 transition-colors bg-transparent border border-[rgba(251,113,133,0.3)] rounded-md px-2 py-[2px] cursor-pointer font-mono text-[11px]"
                      >
                        Yes, withdraw
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setWithdrawState({ kind: "idle" })
                        }
                        className="text-text-muted hover:text-text transition-colors bg-transparent border border-white/10 rounded-md px-2 py-[2px] cursor-pointer font-mono text-[11px]"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {withdrawState.kind === "submitting" && (
                    <span className="text-text-dim italic">
                      Withdrawing…
                    </span>
                  )}

                  {withdrawState.kind === "error" && (
                    <span className="text-[#fb7185]">
                      {withdrawState.message}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
