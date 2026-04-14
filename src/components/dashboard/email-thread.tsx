"use client";

import { useState } from "react";
import { Mail, ChevronDown, ChevronUp, Reply, Send } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { STATUS_CONFIG } from "@/types";
import type { ApplicationEmail, ApplicationStatus } from "@prisma/client";

interface EmailThreadProps {
  applicationId: string;
  initialEmails: ApplicationEmail[];
  readOnly?: boolean;
}

interface ReplyState {
  id: string | "new" | null;
  to: string;
  subject: string;
  body: string;
}

const EMPTY_REPLY: ReplyState = { id: null, to: "", subject: "", body: "" };

function DirectionBadge({ direction }: { direction: string }) {
  if (direction === "inbound") {
    return (
      <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs rounded-full px-2 py-0.5">
        Recruiter
      </span>
    );
  }
  return (
    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs rounded-full px-2 py-0.5">
      You
    </span>
  );
}

function ReplyComposer({
  reply,
  onChange,
  onSubmit,
  onCancel,
  sending,
  error,
  showToInput,
}: {
  reply: ReplyState;
  onChange: (patch: Partial<ReplyState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  sending: boolean;
  error: string | null;
  showToInput: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-3 border-t border-white/8 pt-3 space-y-2"
    >
      <div className="text-xs text-zinc-500">
        <span className="font-medium">To: </span>
        {showToInput ? (
          <input
            type="email"
            required
            value={reply.to}
            onChange={(e) => onChange({ to: e.target.value })}
            placeholder="recipient@example.com"
            className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-2 py-0.5 text-xs w-full mt-0.5 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
          />
        ) : (
          <span className="text-zinc-300">{reply.to}</span>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        <span className="font-medium">Subject: </span>
        <input
          type="text"
          required
          value={reply.subject}
          onChange={(e) => onChange({ subject: e.target.value })}
          className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-2 py-0.5 text-xs w-full mt-0.5 transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
        />
      </div>
      <textarea
        required
        rows={4}
        value={reply.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Write your reply..."
        className="bg-black border border-white/10 rounded-xl text-white placeholder:text-zinc-600 px-3 py-2 text-sm w-full resize-y transition-all duration-200 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.08)]"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-1.5 bg-white text-black font-semibold rounded-xl px-4 py-2 text-xs hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {sending ? "Sending…" : "Send Reply"}
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

export function EmailThread({ applicationId, initialEmails, readOnly = false }: EmailThreadProps) {
  const [emails, setEmails] = useState<ApplicationEmail[]>(initialEmails);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reply, setReply] = useState<ReplyState>(EMPTY_REPLY);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  function patchReply(patch: Partial<ReplyState>) {
    setReply((prev) => ({ ...prev, ...patch }));
  }

  function openReply(email: ApplicationEmail) {
    setSendError(null);
    setReply({
      id: email.id,
      to: email.from,
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      body: "",
    });
  }

  function openCompose() {
    setSendError(null);
    setReply({ id: "new", to: "", subject: "", body: "" });
  }

  function cancelReply() {
    setReply(EMPTY_REPLY);
    setSendError(null);
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: reply.to, subject: reply.subject, body: reply.body }),
      });
      const json = (await res.json()) as { success: boolean; data?: ApplicationEmail; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to send");
      if (json.data) {
        setEmails((prev) => [json.data as ApplicationEmail, ...prev]);
      }
      setReply(EMPTY_REPLY);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  if (emails.length === 0 && reply.id !== "new") {
    return (
      <div className="space-y-3">
        <div className="text-center py-12">
          <Mail className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No emails yet</p>
          <p className="text-xs text-zinc-500 mt-1">
            Forward recruiting emails to your tracking address to see them here.
          </p>
        </div>
        {!readOnly && <ComposeButton onClick={openCompose} />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {emails.map((email) => {
        const isExpanded = expandedId === email.id;
        const isReplying = reply.id === email.id;

        return (
          <div
            key={email.id}
            className={`border-b border-white/5 p-4 ${email.direction === "inbound" ? "bg-[#111111] border border-white/8 rounded-xl" : "bg-white/5 border border-white/10 rounded-xl"}`}
          >
            {/* Header row */}
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-white text-sm font-medium truncate">{email.subject}</p>
                <DirectionBadge direction={email.direction} />
              </div>
              <span className="text-zinc-500 text-xs shrink-0 ml-2">{timeAgo(email.receivedAt)}</span>
            </div>

            <p className="text-zinc-400 text-sm mb-1.5">From: {email.from}</p>

            {email.aiClassification && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 inline-block mb-1.5">
                AI: {STATUS_CONFIG[email.aiClassification as ApplicationStatus].label}
              </span>
            )}

            {/* Body */}
            {isExpanded ? (
              <pre className="whitespace-pre-wrap text-zinc-300 text-sm leading-relaxed font-sans mt-1.5">
                {email.body}
              </pre>
            ) : (
              <p className="text-zinc-400 text-sm mt-1.5 line-clamp-3">{email.body}</p>
            )}

            {/* Toggle + Reply row */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : email.id)}
                className="flex items-center gap-0.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                {isExpanded ? (
                  <><ChevronUp className="w-3 h-3" />Show less</>
                ) : (
                  <><ChevronDown className="w-3 h-3" />Show more</>
                )}
              </button>

              {!readOnly && email.direction === "inbound" && !isReplying && (
                <button
                  type="button"
                  onClick={() => openReply(email)}
                  className="flex items-center gap-0.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-auto"
                >
                  <Reply className="w-3 h-3" />Reply
                </button>
              )}
            </div>

            {/* Inline reply composer */}
            {isReplying && (
              <ReplyComposer
                reply={reply}
                onChange={patchReply}
                onSubmit={handleSendReply}
                onCancel={cancelReply}
                sending={sending}
                error={sendError}
                showToInput={false}
              />
            )}
          </div>
        );
      })}

      {/* Compose new email */}
      {!readOnly && (
        reply.id === "new" ? (
          <ReplyComposer
            reply={reply}
            onChange={patchReply}
            onSubmit={handleSendReply}
            onCancel={cancelReply}
            sending={sending}
            error={sendError}
            showToInput={true}
          />
        ) : (
          <ComposeButton onClick={openCompose} />
        )
      )}
    </div>
  );
}

function ComposeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-2 rounded-xl border border-dashed border-white/10 hover:border-white/20 w-full justify-center"
    >
      <Mail className="w-3 h-3" />
      Compose new email
    </button>
  );
}
