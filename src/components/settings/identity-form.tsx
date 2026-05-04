"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "./section-card";
import { EmailChangeForm } from "./email-change-form";
import {
  identitySchema,
  type IdentityFormValues,
} from "./identity-schema";

interface IdentityFormProps {
  initialName: string;
  email: string;
}

async function patchProfile(payload: { name: string }): Promise<void> {
  const res = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? "Failed to save");
  }
}

export function IdentityForm({ initialName, email }: IdentityFormProps) {
  const { update: updateSession } = useSession();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<IdentityFormValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: { name: initialName },
  });

  async function onSubmit(values: IdentityFormValues) {
    setSubmitting(true);
    try {
      await patchProfile({ name: values.name });
      reset(values);
      await updateSession();
      toast.success("Profile saved");
    } catch (err) {
      console.error("[identity-form] save failed:", err);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      title="Identity"
      description="How you appear across Pipeline."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <label
            htmlFor="display-name"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            autoComplete="name"
            {...register("name")}
            className="w-full rounded-lg bg-black/40 border border-white/10 focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none px-3 py-2 text-sm text-white placeholder:text-zinc-600"
            placeholder="Your name"
          />
          {errors.name && (
            <p className="text-xs text-red-400 mt-1.5">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="account-email"
            className="block text-sm font-medium text-zinc-300 mb-1.5"
          >
            Email
          </label>
          <div className="flex items-center gap-2">
            <input
              id="account-email"
              type="email"
              value={email}
              readOnly
              className="flex-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-zinc-400 cursor-not-allowed"
            />
            <EmailChangeForm currentEmail={email} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={!isDirty || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
