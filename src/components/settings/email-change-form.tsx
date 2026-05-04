"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  emailChangeSchema,
  type EmailChangeFormValues,
} from "./email-change-schema";

interface EmailChangeFormProps {
  currentEmail: string;
}

async function postEmailChangeRequest(newEmail: string): Promise<void> {
  const res = await fetch("/api/account/email-change-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail }),
  });
  if (res.status === 204) return;

  const body = (await res.json().catch(() => null)) as
    | { error?: string }
    | null;

  // Map specific status codes to user-friendly errors. The server already
  // returns short prose; we just translate the code into a default if the
  // body is missing.
  if (res.status === 429) {
    throw new Error(
      body?.error ?? "Too many requests. Please wait a minute and try again.",
    );
  }
  if (res.status === 409) {
    throw new Error(body?.error ?? "That email is already in use.");
  }
  if (res.status === 400) {
    throw new Error(body?.error ?? "Invalid email.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  throw new Error(body?.error ?? "Failed to start email change");
}

export function EmailChangeForm({ currentEmail }: EmailChangeFormProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EmailChangeFormValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { newEmail: "" },
  });

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function onSubmit(values: EmailChangeFormValues) {
    if (values.newEmail === currentEmail.toLowerCase()) {
      toast.error("That's already your email.");
      return;
    }
    setSubmitting(true);
    try {
      await postEmailChangeRequest(values.newEmail);
      toast.success(
        `Verification link sent to ${values.newEmail}. Check your inbox.`,
      );
      setOpen(false);
      reset();
    } catch (err) {
      console.error("[email-change-form] request failed:", err);
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else setOpen(true);
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-3 py-2 text-xs text-zinc-300 hover:text-white transition-colors"
        >
          Change email
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 shadow-2xl focus:outline-none">
          <Dialog.Title className="text-lg font-semibold text-white mb-1">
            Change email
          </Dialog.Title>
          <Dialog.Description className="text-sm text-zinc-400 mb-5">
            We&apos;ll send a verification link to your new address. Click the
            link to confirm — you&apos;ll be signed out everywhere else.
          </Dialog.Description>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="current-email-readonly"
                className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5"
              >
                Current email
              </label>
              <input
                id="current-email-readonly"
                type="email"
                value={currentEmail}
                readOnly
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-zinc-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label
                htmlFor="new-email"
                className="block text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5"
              >
                New email
              </label>
              <input
                id="new-email"
                type="email"
                autoComplete="email"
                disabled={submitting}
                aria-invalid={!!errors.newEmail}
                aria-describedby={errors.newEmail ? "new-email-error" : undefined}
                {...register("newEmail")}
                className="w-full rounded-lg bg-black/40 border border-white/10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                placeholder="you@new-address.com"
              />
              {errors.newEmail && (
                <p id="new-email-error" className="text-xs text-red-400 mt-1.5">
                  {errors.newEmail.message}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-60"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {submitting ? "Sending…" : "Send verification"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
