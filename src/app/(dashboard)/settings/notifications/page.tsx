"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Loader2, Check } from "lucide-react";

interface Prefs {
  emailFrequency: "INSTANT" | "DAILY" | "NEVER";
  emailOnOffer: boolean;
  emailOnInterview: boolean;
  emailOnStatusChange: boolean;
  emailOnEmailReceived: boolean;
  emailOnListingRemoved: boolean;
  emailOnTeamMessage: boolean;
  emailOnSystem: boolean;
  emailOnApplyFailed: boolean;
}

const FREQUENCY_OPTIONS: Array<{
  value: Prefs["emailFrequency"];
  label: string;
  desc: string;
}> = [
  {
    value: "INSTANT",
    label: "Instant",
    desc: "Email me as things happen",
  },
  {
    value: "DAILY",
    label: "Daily digest",
    desc: "One summary email per day",
  },
  {
    value: "NEVER",
    label: "Never",
    desc: "No emails (critical account issues still send)",
  },
];

const EMAIL_TOGGLES: Array<{
  field: keyof Prefs;
  label: string;
  alwaysOn?: boolean;
}> = [
  { field: "emailOnOffer", label: "Job offers received", alwaysOn: true },
  { field: "emailOnInterview", label: "Interview invites" },
  { field: "emailOnStatusChange", label: "Other status changes" },
  { field: "emailOnApplyFailed", label: "Application submission failures" },
  { field: "emailOnListingRemoved", label: "Job listings removed" },
  { field: "emailOnEmailReceived", label: "New recruiting emails received" },
  { field: "emailOnTeamMessage", label: "Team announcements from Pipeline" },
  { field: "emailOnSystem", label: "Account & billing updates" },
];

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then((json) => setPrefs(json.data));
  }, []);

  async function save(updated: Prefs) {
    setSaving(true);
    setSaved(false);
    await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function update<K extends keyof Prefs>(field: K, value: Prefs[K]) {
    if (!prefs) return;
    const next = { ...prefs, [field]: value };
    setPrefs(next);
    save(next);
  }

  if (!prefs) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-10">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="w-5 h-5" /> Notification Preferences
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          All notifications appear in the bell icon. Configure which ones also send email.
        </p>
      </div>

      {/* Frequency */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Email Frequency
        </h2>
        <div className="space-y-2">
          {FREQUENCY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={[
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                prefs.emailFrequency === opt.value
                  ? "border-blue-500/40 bg-blue-500/5"
                  : "border-zinc-800 hover:border-zinc-700",
              ].join(" ")}
            >
              <input
                type="radio"
                name="emailFrequency"
                value={opt.value}
                checked={prefs.emailFrequency === opt.value}
                onChange={() => update("emailFrequency", opt.value)}
                className="mt-0.5 accent-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-white">{opt.label}</p>
                <p className="text-xs text-zinc-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Per-type toggles */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Email me about</h2>
        <div className="space-y-1">
          {EMAIL_TOGGLES.map(({ field, label, alwaysOn }) => (
            <label
              key={field}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
            >
              <span className="text-sm text-zinc-300">{label}</span>
              <div className="flex items-center gap-2">
                {alwaysOn && (
                  <span className="text-xs text-zinc-500 italic">always</span>
                )}
                <input
                  type="checkbox"
                  checked={prefs[field] as boolean}
                  disabled={alwaysOn}
                  onChange={(e) => update(field, e.target.checked as Prefs[typeof field])}
                  className="accent-blue-500 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Save indicator */}
      <div className="h-6 flex items-center gap-2 text-sm">
        {saving && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />
            <span className="text-zinc-500">Saving…</span>
          </>
        )}
        {saved && !saving && (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400">Saved</span>
          </>
        )}
      </div>
    </div>
  );
}
