"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Loader2 } from "lucide-react";
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  contactFormSchema,
  type ContactFormValues,
} from "./contact-schema";

interface ContactFormProps {
  defaultEmail: string;
}

const inputClass =
  "w-full rounded-xl bg-[#0a0a0a] border border-white/10 text-white placeholder-zinc-600 px-4 py-3 text-sm transition-colors duration-150 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20";

const labelClass = "block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1.5";

const errorClass = "mt-1.5 text-xs text-red-400";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; reason: "rate" | "generic" };

async function submitContact(values: ContactFormValues): Promise<Response> {
  return fetch("/api/contact", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}

export function ContactForm({ defaultEmail }: ContactFormProps) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: defaultEmail,
      category: "general",
      pageUrl: "",
      message: "",
      website: "",
    },
  });

  async function onSubmit(values: ContactFormValues): Promise<void> {
    setState({ kind: "submitting" });
    try {
      const res = await submitContact(values);
      if (res.ok) {
        setState({ kind: "success" });
        return;
      }
      if (res.status === 429) {
        setState({ kind: "error", reason: "rate" });
        return;
      }
      setState({ kind: "error", reason: "generic" });
    } catch {
      setState({ kind: "error", reason: "generic" });
    }
  }

  if (state.kind === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-8 text-center"
      >
        <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-6 h-6 text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Thanks! Your message is in.</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          We&apos;ll respond within 2 business days. For urgent privacy concerns, also reach us at{" "}
          <a
            href="mailto:support@trypipeline.ai"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-sm"
          >
            support@trypipeline.ai
          </a>
          .
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  const errorMessage =
    state.kind === "error"
      ? state.reason === "rate"
        ? "You've sent a few messages recently — please try again in an hour or email support@trypipeline.ai directly."
        : "Something went wrong. Please try again or email support@trypipeline.ai directly."
      : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-6 sm:p-8 space-y-5"
    >
      {errorMessage && (
        <p
          role="alert"
          className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg"
        >
          {errorMessage}
        </p>
      )}

      <div>
        <label htmlFor="contact-name" className={labelClass}>
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          autoComplete="name"
          disabled={submitting}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "contact-name-error" : undefined}
          {...register("name")}
          className={inputClass}
          placeholder="Jane Doe"
        />
        {errors.name && (
          <p id="contact-name-error" className={errorClass}>
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-email" className={labelClass}>
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          disabled={submitting}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "contact-email-error" : undefined}
          {...register("email")}
          className={inputClass}
          placeholder="you@example.com"
        />
        {errors.email && (
          <p id="contact-email-error" className={errorClass}>
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-category" className={labelClass}>
          Category
        </label>
        <select
          id="contact-category"
          disabled={submitting}
          aria-invalid={!!errors.category}
          aria-describedby={errors.category ? "contact-category-error" : undefined}
          {...register("category")}
          className={inputClass}
        >
          {CONTACT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat} className="bg-black text-white">
              {CONTACT_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        {errors.category && (
          <p id="contact-category-error" className={errorClass}>
            {errors.category.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-page-url" className={labelClass}>
          Page URL <span className="normal-case text-zinc-500 tracking-normal">(optional)</span>
        </label>
        <input
          id="contact-page-url"
          type="url"
          inputMode="url"
          disabled={submitting}
          aria-invalid={!!errors.pageUrl}
          aria-describedby={errors.pageUrl ? "contact-page-url-error" : undefined}
          {...register("pageUrl")}
          className={inputClass}
          placeholder="https://trypipeline.ai/jobs"
        />
        {errors.pageUrl && (
          <p id="contact-page-url-error" className={errorClass}>
            {errors.pageUrl.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="contact-message" className={labelClass}>
          Message
        </label>
        <textarea
          id="contact-message"
          rows={6}
          disabled={submitting}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          {...register("message")}
          className={`${inputClass} resize-y min-h-[120px]`}
          placeholder="Tell us what's going on…"
        />
        {errors.message && (
          <p id="contact-message-error" className={errorClass}>
            {errors.message.message}
          </p>
        )}
      </div>

      {/* Honeypot — visually hidden, never tab-focused, real users won't fill it. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-900/40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {submitting ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
