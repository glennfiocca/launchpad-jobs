// STABLE PUBLIC URL — referenced in the published Terms of Service / Privacy
// Policy as the CCPA/CPRA "Do Not Sell or Share My Personal Information"
// link. Do not rename, move, or remove without legal review.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Do Not Sell or Share — Pipeline",
  description:
    "Pipeline does not sell or share your personal information. We honor the Global Privacy Control (GPC) signal automatically.",
  robots: { index: true, follow: true },
};

export default function DoNotSellPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-16 sm:py-20">
      <article className="mx-auto w-full max-w-2xl text-zinc-300">
        <header className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Do Not Sell or Share My Personal Information
          </h1>
        </header>

        <section className="space-y-5 text-sm sm:text-base leading-relaxed">
          <p>
            Pipeline does not sell or share your personal information for
            cross-context behavioral advertising. We have no third-party
            advertising partners.
          </p>

          <p>
            We honor the{" "}
            <strong className="text-white">
              Global Privacy Control (GPC)
            </strong>{" "}
            signal automatically. When your browser sends GPC, we:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>Suppress non-essential analytics for that session.</li>
            <li>
              Record an opt-out on your account if you&apos;re signed in.
            </li>
          </ul>

          <p>
            To make a specific request to access, correct, or delete your
            personal information, use our{" "}
            <Link
              href="/contact?category=privacy"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-sm"
            >
              contact form
            </Link>{" "}
            or email{" "}
            <a
              href="mailto:support@trypipeline.ai"
              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded-sm"
            >
              support@trypipeline.ai
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  );
}
