// STABLE PUBLIC URL — referenced in the published Terms of Service.
// Do not rename, move, or remove without legal review.
//
// /contact is the public-facing privacy/support contact channel listed in
// the Termly-generated Terms of Service alongside support@trypipeline.ai.
// It MUST remain reachable to anonymous (signed-out) visitors.

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ContactForm } from "@/components/contact/contact-form";

export const metadata: Metadata = {
  title: "Contact — Pipeline",
  description:
    "Send a message to the Pipeline team — questions, privacy concerns, or feedback.",
};

export default async function ContactPage() {
  // Best-effort session read — used only to pre-fill email. Page is NOT auth-gated.
  let defaultEmail = "";
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) defaultEmail = session.user.email;
  } catch {
    defaultEmail = "";
  }

  return (
    <main className="min-h-screen bg-black px-4 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Contact us
          </h1>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Have a question, privacy concern, or feedback? Send us a message
            below — we&apos;ll respond within 2 business days. You can also
            reach us at{" "}
            <a
              href="mailto:support@trypipeline.ai"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-sm"
            >
              support@trypipeline.ai
            </a>
            .
          </p>
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left text-xs sm:text-sm text-zinc-400 leading-relaxed">
            <p className="font-medium text-zinc-300 mb-1">
              Privacy &amp; data rights
            </p>
            <p>
              You can use this form (or email{" "}
              <a
                href="mailto:support@trypipeline.ai"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                support@trypipeline.ai
              </a>
              ) to request access to, correction of, or deletion of the
              personal information we hold about you. Select{" "}
              <span className="text-zinc-200">
                &ldquo;Privacy or data rights request&rdquo;
              </span>{" "}
              as the category and describe what you&apos;d like us to do.
            </p>
          </div>
        </header>

        <ContactForm defaultEmail={defaultEmail} />
      </div>
    </main>
  );
}
