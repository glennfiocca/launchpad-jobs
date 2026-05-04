// STABLE PUBLIC URL — referenced in the published Terms of Service.
// Do not rename, move, or remove without legal review.
//
// /privacy serves the Termly-generated Privacy Policy. The legal copy lives
// verbatim in privacy-policy-html.ts — DO NOT hand-edit. To update, regenerate
// in the Termly wizard and replace that file's PRIVACY_POLICY_HTML constant.

import type { Metadata } from "next";
import {
  PRIVACY_POLICY_HTML,
  PRIVACY_POLICY_LAST_UPDATED,
} from "./privacy-policy-html";

export const metadata: Metadata = {
  title: "Privacy Policy — Pipeline",
  description:
    "How Pipeline Inc. collects, uses, stores, and shares your personal information.",
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-10 sm:py-16">
      {/*
        Termly's wizard output is rendered verbatim via dangerouslySetInnerHTML.
        Content is a static string from a trusted legal SaaS — no untrusted
        user input ever flows into this prop.
      */}
      <article
        className="mx-auto max-w-4xl rounded-2xl bg-white text-zinc-800 shadow-2xl shadow-black/40 px-6 py-10 sm:px-12 sm:py-14"
        dangerouslySetInnerHTML={{ __html: PRIVACY_POLICY_HTML }}
        data-last-updated={PRIVACY_POLICY_LAST_UPDATED}
      />
    </main>
  );
}
