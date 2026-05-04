// STABLE PUBLIC URL — referenced in the published Terms of Service.
// Do not rename, move, or remove without legal review.
//
// /privacy embeds the Termly-hosted Privacy Notice via their Code Snippet.
// The legal copy lives in Termly and auto-updates on every page load — to
// change wording, edit the policy in Termly's dashboard. There is no local
// HTML copy to keep in sync.

import type { Metadata } from "next";
import { TermlyEmbed } from "@/components/legal/termly-embed";

// Document ID from Termly's Code Snippet for the Privacy Policy.
// Verify under Termly Dashboard → Privacy Policy → Publish → Code Snippet.
const PRIVACY_DOC_ID = "fbf177d6-ddba-465b-8675-6e1e8115a3dd";

export const metadata: Metadata = {
  title: "Privacy Policy — Pipeline",
  description:
    "How Pipeline Inc. collects, uses, stores, and shares your personal information.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 sm:py-16">
      <article className="mx-auto max-w-4xl rounded-2xl bg-white text-zinc-800 shadow-2xl shadow-black/40 px-6 py-10 sm:px-12 sm:py-14">
        <TermlyEmbed documentId={PRIVACY_DOC_ID} />
      </article>
    </main>
  );
}
