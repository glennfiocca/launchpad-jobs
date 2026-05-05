// STABLE PUBLIC URL — referenced from the published Privacy Policy
// ("see our Cookie Notice") and from the site footer. Do not rename,
// move, or remove without legal review.
//
// /cookies embeds the Termly-hosted Cookie Policy via their Code Snippet.
// Copy lives in Termly and auto-updates on every page load — to change
// wording, edit the document in Termly's dashboard. There is no local
// HTML copy to keep in sync.

import type { Metadata } from "next";
import { TermlyEmbed } from "@/components/legal/termly-embed";

// Document ID from Termly's Code Snippet for the Cookie Policy.
// Verify under Termly Dashboard → Cookie Policy → Publish → Code Snippet.
const COOKIES_DOC_ID = "295557d8-12c5-4660-8dd2-a06075358a5d";

export const metadata: Metadata = {
  title: "Cookie Policy — Pipeline",
  description:
    "How Pipeline Inc. uses cookies and similar tracking technologies.",
  robots: { index: true, follow: true },
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 sm:py-16">
      <article className="mx-auto max-w-4xl rounded-2xl bg-white text-zinc-800 shadow-2xl shadow-black/40 px-6 py-10 sm:px-12 sm:py-14">
        <TermlyEmbed documentId={COOKIES_DOC_ID} />
      </article>
    </main>
  );
}
