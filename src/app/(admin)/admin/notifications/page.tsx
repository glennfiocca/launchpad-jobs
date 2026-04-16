"use client";

import { useState } from "react";
import { Send, Loader2, Check, Users } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().max(2000).optional(),
  ctaUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  audience: z.enum(["ALL", "SUBSCRIBED", "FREE"]),
});

type Audience = "ALL" | "SUBSCRIBED" | "FREE";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<Audience>("ALL");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    setResult(null);

    const parsed = schema.safeParse({ title, body, ctaUrl: ctaUrl || undefined, audience });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation error");
      return;
    }

    const confirmed = window.confirm(
      `Send "${title}" to ${audience === "ALL" ? "all users" : audience === "SUBSCRIBED" ? "Pro subscribers" : "free users"}?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const res = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: body || undefined,
          ctaUrl: ctaUrl || undefined,
          audience,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Failed to send");
      } else {
        setResult(json.data);
        setTitle("");
        setBody("");
        setCtaUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Send className="w-5 h-5 text-violet-400" /> Broadcast Notification
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          Send an in-app notification to all or a subset of users.
        </p>
      </div>

      <div className="space-y-4">
        {/* Audience */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            <Users className="inline w-3.5 h-3.5 mr-1" /> Audience
          </label>
          <div className="flex gap-2">
            {(["ALL", "SUBSCRIBED", "FREE"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAudience(a)}
                className={[
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  audience === a
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600",
                ].join(" ")}
              >
                {a === "ALL" ? "All users" : a === "SUBSCRIBED" ? "Pro only" : "Free only"}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. New features available"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Message (optional)
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="A brief description of the update…"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>

        {/* CTA URL */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Link URL (optional)
          </label>
          <input
            type="url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        {result && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <Check className="w-4 h-4" />
            Sent to {result.sent} users
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending || !title.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {sending ? "Sending…" : "Send Notification"}
        </button>
      </div>
    </div>
  );
}
