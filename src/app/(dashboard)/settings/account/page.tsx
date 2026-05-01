"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { AlertTriangle, Loader2, X } from "lucide-react";

const CONFIRM_PHRASE = "DELETE";

export default function AccountSettingsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText === CONFIRM_PHRASE && !submitting;

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? "Failed to delete account");
      }
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete account");
      setSubmitting(false);
    }
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setConfirmText("");
    setError(null);
  }

  return (
    <div className="max-w-lg mx-auto py-12 px-4 space-y-10">
      <div>
        <h1 className="text-xl font-bold text-white">Account</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Manage your account and data.
        </p>
      </div>

      {/* Danger Zone */}
      <section className="rounded-lg border border-red-900/40 bg-zinc-900 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-white">Danger Zone</h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Delete account</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Your applications and email history will be retained anonymously for
            analytics, but your profile, name, email, resume, and login will be
            permanently removed. This cannot be undone.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center rounded-md bg-red-600 hover:bg-red-700 transition-colors text-white text-sm font-medium px-4 py-2"
        >
          Delete my account
        </button>
      </section>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
            <div className="flex items-start justify-between p-5 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <h3
                  id="delete-account-title"
                  className="text-sm font-semibold text-white"
                >
                  Delete account
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="text-zinc-500 hover:text-zinc-300 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-zinc-300 leading-relaxed">
                This action is permanent. To confirm, type{" "}
                <span className="font-mono font-semibold text-red-400">
                  {CONFIRM_PHRASE}
                </span>{" "}
                below.
              </p>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={submitting}
                autoFocus
                placeholder={CONFIRM_PHRASE}
                className="w-full rounded-md bg-zinc-950 border border-zinc-800 focus:border-red-500/60 focus:outline-none px-3 py-2 text-sm text-white font-mono disabled:opacity-50"
              />

              {error && (
                <p className="text-xs text-red-400" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-zinc-800">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-md px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canConfirm}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 disabled:bg-red-900/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
