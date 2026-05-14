"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// FeedbackTab — persistent right-edge feedback widget.
//
// Two trigger surfaces driven by viewport size:
//   • Desktop (≥768px): vertical "FEEDBACK" rail anchored to the right
//     edge at vertical center, rotated -90deg.
//   • Mobile  (<768px):  bottom-right circular icon button.
// Both open the same Radix Popover panel containing a textarea, tag
// chips (Idea / Bug / Praise / Other), and a Send button.
//
// Submission posts to /api/feedback, which accepts sessionless requests.
// Hidden on /auth/* routes to avoid covering the auth form on narrow
// viewports.
//
// State: an unsent message draft is persisted to sessionStorage so an
// accidental close-mid-write doesn't lose the user's text.

type FeedbackType = "BUG" | "FEATURE" | "PRAISE" | "OTHER";

interface TagOption {
  id: FeedbackType;
  label: string;
}

const TAGS: ReadonlyArray<TagOption> = [
  { id: "FEATURE", label: "Idea" },
  { id: "BUG", label: "Bug" },
  { id: "PRAISE", label: "Praise" },
  { id: "OTHER", label: "Other" },
];

const DRAFT_KEY = "feedback-draft";

interface FeedbackResponse {
  success: boolean;
  data?: { id: string };
  error?: string;
}

export function FeedbackTab() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [tag, setTag] = useState<FeedbackType>("FEATURE");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname() ?? "";

  // Restore draft on mount.
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) setText(draft);
    } catch {
      // sessionStorage may be unavailable (private mode, etc.) — ignore.
    }
  }, []);

  // Persist draft whenever it changes (but only while we have content;
  // wipe the key once we've sent successfully).
  useEffect(() => {
    try {
      if (sent) {
        sessionStorage.removeItem(DRAFT_KEY);
      } else if (text.trim()) {
        sessionStorage.setItem(DRAFT_KEY, text);
      } else {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // ignore
    }
  }, [text, sent]);

  // Hide entirely on auth routes — the widget overlaps the form on mobile.
  if (pathname.startsWith("/auth")) return null;

  async function submit(): Promise<void> {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tag,
          message: text.trim(),
          pageUrl: window.location.href,
        }),
      });
      const json = (await res.json()) as FeedbackResponse;
      if (json.success) {
        setSent(true);
        setText("");
      } else {
        setError(json.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(nextOpen);
    // Reset "sent" state when the user closes the panel so the next open
    // shows the form again.
    if (!nextOpen && sent) {
      setSent(false);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      {/* Desktop trigger — vertical rail anchored to right edge. */}
      <div className="hidden md:block fixed right-0 top-1/2 -translate-y-1/2 z-[80] font-display">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Send feedback"
            className={cn(
              // The rotate transforms the entire button so the text reads
              // top-to-bottom; transform-origin anchors it so the visual
              // position stays flush against the right edge.
              "relative inline-flex items-center gap-2 px-4 py-[7px]",
              "[transform-origin:100%_100%] -rotate-90",
              "rounded-t-[10px] border border-b-0 border-[rgba(167,139,250,0.5)]",
              "bg-gradient-to-b from-accent-light to-accent text-white",
              "text-[11.5px] font-semibold uppercase tracking-wider whitespace-nowrap",
              "shadow-[-6px_-6px_22px_-8px_rgba(99,102,241,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]",
              "transition-colors duration-200",
              "hover:from-[#a5b4fc] hover:to-accent-light hover:border-[rgba(196,181,253,0.7)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            )}
          >
            <MessageSquare className="w-[13px] h-[13px] rotate-90" aria-hidden="true" />
            <span>Feedback</span>
          </button>
        </Popover.Trigger>
      </div>

      {/* Mobile trigger — floating circular icon at bottom-right. */}
      <div className="md:hidden fixed right-4 bottom-4 z-[80]">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Send feedback"
            className={cn(
              "flex items-center justify-center w-12 h-12 rounded-full",
              "bg-gradient-to-b from-accent-light to-accent text-white",
              "border border-[rgba(167,139,250,0.5)]",
              "shadow-[0_10px_30px_-8px_rgba(99,102,241,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]",
              "transition-transform duration-200 hover:-translate-y-px",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            )}
          >
            <MessageSquare className="w-5 h-5" aria-hidden="true" />
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          // Anchor next to whichever trigger is in the DOM. On desktop
          // we offset farther to clear the rotated rail; on mobile we
          // open above the FAB.
          side="left"
          sideOffset={12}
          align="center"
          collisionPadding={16}
          className={cn(
            "w-[320px] p-3.5 rounded-[14px] bg-bg-elev border border-white/10",
            "shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] z-[81] font-display",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          )}
        >
          <div className="flex items-center justify-between mb-2.5 text-[13.5px] font-medium text-text">
            <span>Send feedback</span>
            <Popover.Close
              className="text-text-dim hover:text-text px-1 leading-none text-xl"
              aria-label="Close"
            >
              ×
            </Popover.Close>
          </div>
          {sent ? (
            <div className="py-5 text-center text-[14px] font-medium text-accent-lavender">
              Thanks — we got it.
            </div>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's working? What's broken? Tell us anything."
                className={cn(
                  "w-full min-h-[96px] px-3 py-2.5 rounded-[9px] resize-y leading-snug",
                  "bg-black/30 border border-white/10 text-text font-display text-[13.5px]",
                  "placeholder:text-text-dim outline-none box-border",
                  "focus:border-accent-light/50",
                )}
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {TAGS.map((t) => {
                  const active = tag === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTag(t.id)}
                      className={cn(
                        "px-2.5 py-[5px] rounded-full text-[11.5px] font-display transition-colors duration-150 border",
                        active
                          ? "text-text border-accent-light/40 bg-accent-light/[0.08]"
                          : "text-text-muted border-white/[0.08] bg-white/[0.04] hover:text-text hover:border-accent-light/40 hover:bg-accent-light/[0.08]",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {error && (
                <p className="mt-2 text-[11px] text-red-400" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2.5">
                <span className="font-mono text-[10.5px] text-text-dim">
                  We read every note.
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim() || submitting}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[13px] font-semibold font-display",
                    "bg-text text-bg transition-colors duration-150 hover:bg-white",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  )}
                >
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Tiny client-only wrapper for mounting in the server Root layout. Keeps
// the use-client boundary out of layout.tsx itself.
export function FeedbackTabMount() {
  return <FeedbackTab />;
}

