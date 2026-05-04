// STABLE PUBLIC URL — referenced in published legal documents.
// Do not rename, move, or remove without legal review.
//
// /terms embeds the Termly-hosted Terms of Service via their Code Snippet.
// The legal copy lives in Termly and auto-updates on every page load — to
// change wording, edit the document in Termly's dashboard. There is no
// local HTML copy to keep in sync.

import type { Metadata } from "next";
import { TermlyEmbed } from "@/components/legal/termly-embed";

// Document ID from Termly's Code Snippet for the Terms of Service.
// Verify under Termly Dashboard → Terms & Conditions → Publish → Code Snippet.
const TERMS_DOC_ID = "71156531-51bc-4974-a595-aaee36153423";

export const metadata: Metadata = {
  title: "Terms of Service — Pipeline",
  description:
    "The terms governing your use of Pipeline Inc.'s services.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 sm:py-16">
      <article className="mx-auto max-w-4xl rounded-2xl bg-white text-zinc-800 shadow-2xl shadow-black/40 px-6 py-10 sm:px-12 sm:py-14">
        <TermlyEmbed documentId={TERMS_DOC_ID} />
      </article>
    </main>
  );
}
