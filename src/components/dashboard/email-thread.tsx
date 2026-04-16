"use client";

import { useState } from "react";
import { MessageSquare, Sparkles, ChevronDown, ChevronUp, Reply, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import { SenderAvatar } from "@/components/ui/sender-avatar";
import { senderDisplayName, messageTime } from "./email-thread-helpers";
import type { ApplicationEmail, ApplicationStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailThreadProps {
  applicationId: string;
  initialEmails: ApplicationEmail[];
  readOnly?: boolean;
}

type ComposerMode = "idle" | "reply" | "compose";

interface ComposerState {
  mode: ComposerMode;
  to: string;
  subject: string;
  body: string;
  replyToId: string | null;
}

const EMPTY_COMPOSER: ComposerState = {
  mode: "idle",
  to: "",
  subject: "",
  body: "",
  replyToId: null,
};

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mb-4">
        <MessageSquare className="w-5 h-5 text-zinc-600" />
      </div>
      <p className="text-sm font-medium text-zinc-300 mb-1">Messages from the hiring team will appear here</p>
      <p className="text-xs text-zinc-500 max-w-xs">
        When a recruiter reaches out, you'll see it here and can reply directly.
      </p>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  email,
  isExpanded,
  onToggleExpand,
  onReply,
  readOnly,
}: {
  email: ApplicationEmail;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onReply: () => void;
  readOnly: boolean;
}) {
  const isInbound = email.direction === "inbound";
  const name = isInbound ? senderDisplayName(email.from) : "You";
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={cn("flex gap-2.5 group", isInbound ? "justify-start" : "justify-end")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {isInbound && <SenderAvatar name={name} size="md" className="mt-0.5 self-start" />}

      <div className={cn("flex flex-col gap-1 max-w-[80%]", isInbound ? "items-start" : "items-end")}>
        {/* Sender + time */}
        <div className={cn("flex items-center gap-2 px-1", isInbound ? "" : "flex-row-reverse")}>
          <span className="text-xs font-medium text-zinc-300">{name}</span>
          <span className="text-[11px] text-zinc-600">{messageTime(email.receivedAt)}</span>
        </div>

        {/* Subject line */}
        <p className={cn("text-[11px] px-1", isInbound ? "text-zinc-500" : "text-zinc-500 text-right")}>
          {email.subject}
        </p>

        {/* Bubble */}
        <div
          className={cn(
            "relative rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isInbound
              ? "bg-[#141414] border border-white/8 rounded-tl-md text-zinc-200"
              : "bg-indigo-500/10 border border-indigo-500/15 rounded-tr-md text-indigo-100"
          )}
        >
          {isExpanded ? (
            <pre className="whitespace-pre-wrap font-sans text-sm">{email.body}</pre>
          ) : (
            <p className="line-clamp-4">{email.body}</p>
          )}

          {/* Hover actions */}
          <div
            className={cn(
              "absolute -bottom-3 flex items-center gap-1 transition-opacity",
              isInbound ? "left-2" : "right-2",
              showActions ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex items-center gap-0.5 bg-[#1a1a1a] border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {isExpanded ? (
                <><ChevronUp className="w-2.5 h-2.5" />Less</>
              ) : (
                <><ChevronDown className="w-2.5 h-2.5" />More</>
              )}
            </button>
            {!readOnly && isInbound && (
              <button
                type="button"
                onClick={onReply}
                className="flex items-center gap-0.5 bg-[#1a1a1a] border border-white/10 rounded-full px-2 py-0.5 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Reply className="w-2.5 h-2.5" />Reply
              </button>
            )}
          </div>
        </div>

        {/* AI classification chip */}
        {email.aiClassification && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/8 border border-purple-500/15 rounded-full mt-1">
            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
            <span className="text-[10px] text-purple-400">
              {STATUS_CONFIG[email.aiClassification as ApplicationStatus].label}
            </span>
          </div>
        )}
      </div>

      {!isInbound && (
        <div className="w-9 h-9 shrink-0 self-start mt-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
          <span className="text-xs font-semibold text-indigo-300">Y</span>
        </div>
      )}
    </div>
  );
}

// ─── Bottom-docked composer ───────────────────────────────────────────────────

function ConversationComposer({
  composer,
  onChange,
  onSubmit,
  onCancel,
  sending,
  error,
}: {
  composer: ComposerState;
  onChange: (patch: Partial<ComposerState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  sending: boolean;
  error: string | null;
}) {
  const isCompose = composer.mode === "compose";

  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-white/8 pt-4 mt-4 space-y-2"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium text-zinc-400">
          {isCompose ? "New message" : "Reply"}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isCompose && (
        <input
          type="email"
          required
          value={composer.to}
          onChange={(e) => onChange({ to: e.target.value })}
          placeholder="To: recipient@example.com"
          className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-3 py-2 text-xs w-full focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
        />
      )}

      <input
        type="text"
        required
        value={composer.subject}
        onChange={(e) => onChange({ subject: e.target.value })}
        placeholder="Subject"
        className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-3 py-2 text-xs w-full focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
      />

      <textarea
        required
        rows={4}
        value={composer.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Write your message…"
        className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-3 py-2 text-sm w-full resize-y focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-1.5 bg-white text-black font-semibold rounded-xl px-4 py-2 text-xs hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-white/10 text-zinc-300 hover:border-white/25 hover:text-white rounded-xl px-4 py-2 text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmailThread({ applicationId, initialEmails, readOnly = false }: EmailThreadProps) {
  // Sort oldest-first for chat-style reading
  const [emails, setEmails] = useState<ApplicationEmail[]>(
    [...initialEmails].sort(
      (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    )
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>(EMPTY_COMPOSER);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function patchComposer(patch: Partial<ComposerState>) {
    setComposer((prev) => ({ ...prev, ...patch }));
  }

  function openReply(email: ApplicationEmail) {
    setSendError(null);
    setComposer({
      mode: "reply",
      to: email.from,
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      body: "",
      replyToId: email.id,
    });
  }

  function openCompose() {
    setSendError(null);
    setComposer({ mode: "compose", to: "", subject: "", body: "", replyToId: null });
  }

  function cancelComposer() {
    setComposer(EMPTY_COMPOSER);
    setSendError(null);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: composer.to, subject: composer.subject, body: composer.body }),
      });
      const json = (await res.json()) as { success: boolean; data?: ApplicationEmail; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to send");
      if (json.data) {
        setEmails((prev) => [...prev, json.data as ApplicationEmail]);
      }
      setComposer(EMPTY_COMPOSER);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const showComposer = composer.mode !== "idle";

  return (
    <div className="flex flex-col gap-4">
      {emails.length === 0 && !showComposer ? (
        <>
          <EmptyState />
          {!readOnly && (
            <button
              type="button"
              onClick={openCompose}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 w-full justify-center"
            >
              <MessageSquare className="w-3 h-3" />
              Compose message
            </button>
          )}
        </>
      ) : (
        <>
          {/* Message list */}
          <div className="space-y-6 pb-2">
            {emails.map((email) => (
              <MessageBubble
                key={email.id}
                email={email}
                isExpanded={expandedId === email.id}
                onToggleExpand={() => setExpandedId(expandedId === email.id ? null : email.id)}
                onReply={() => openReply(email)}
                readOnly={readOnly}
              />
            ))}
          </div>

          {/* Compose action (when no composer open) */}
          {!readOnly && !showComposer && (
            <button
              type="button"
              onClick={openCompose}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 w-full justify-center"
            >
              <MessageSquare className="w-3 h-3" />
              Compose new message
            </button>
          )}

          {/* Bottom-docked composer */}
          {showComposer && (
            <ConversationComposer
              composer={composer}
              onChange={patchComposer}
              onSubmit={handleSend}
              onCancel={cancelComposer}
              sending={sending}
              error={sendError}
            />
          )}
        </>
      )}
    </div>
  );
}
