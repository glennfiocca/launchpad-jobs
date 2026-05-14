"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useTodayCount } from "@/hooks/use-today-count";
import { JobSearchBlock } from "@/components/home/job-search-block";

interface HomeHeroProps {
  /** Total active jobs available — drives the right-aligned role count meta */
  roleCount: number;
}

// Hero anchors the editorial homepage redesign — eyebrow chip, big tagline,
// sub-copy, restyled search bar, and a popular-searches meta row.
//
// Lives as a Client Component because:
//   1. `useTodayCount` polls /api/stats/today
//   2. framer-motion reveal for the headline / sub
//   3. JobSearchBlock is itself client-side
//
// The `roleCount` is fetched server-side (db.job.count) so it never flickers
// on first paint.
export function HomeHero({ roleCount }: HomeHeroProps) {
  const todayCount = useTodayCount();
  const reduceMotion = useReducedMotion();

  // Reveal sequence: eyebrow → h1 → sub → search. Skipped under
  // prefers-reduced-motion via framer-motion's hook.
  const fade = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <section className="relative flex flex-col items-center text-center px-6 pt-16 pb-10">
      {/* Eyebrow chip — live count with pulsing cyan dot */}
      <motion.span
        {...fade}
        className="inline-flex items-center gap-2 px-2.5 py-[5px] rounded-full border border-[rgba(245,244,241,0.12)] font-mono text-[11px] tracking-[0.04em] text-text-muted"
      >
        <span
          aria-hidden="true"
          className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-cyan"
          style={{ boxShadow: "0 0 8px #22d3ee" }}
        >
          <span className="absolute inset-0 rounded-full bg-accent-cyan motion-safe:animate-ping opacity-60" />
        </span>
        Live · {todayCount.toLocaleString()} applications today
      </motion.span>

      {/* H1 — Bricolage 500, lavender em for "Any job." */}
      <motion.h1
        {...fade}
        transition={
          reduceMotion
            ? undefined
            : { duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] as const }
        }
        className="mt-5 mb-4 font-display font-medium text-text leading-[0.98] tracking-[-0.04em]"
        style={{ fontSize: "clamp(44px, 6vw, 80px)" }}
      >
        One application.
        <br />
        <em className="not-italic font-medium text-accent-lavender">
          Any job.
        </em>
      </motion.h1>

      {/* Sub-copy */}
      <motion.p
        {...fade}
        transition={
          reduceMotion
            ? undefined
            : { duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] as const }
        }
        className="text-[17px] leading-[1.5] text-text-muted max-w-[560px] mx-auto mb-7"
      >
        From first apply to final round, your search, applications, and
        conversations stay in one place.
      </motion.p>

      {/* Restyled search bar (preserves all query logic) */}
      <motion.div
        {...fade}
        transition={
          reduceMotion
            ? undefined
            : { duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] as const }
        }
        className="w-full max-w-[780px]"
      >
        <JobSearchBlock />
      </motion.div>

      {/* Popular searches meta row */}
      <div
        className="mt-3.5 w-full max-w-[780px] flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 font-mono text-[11.5px] text-text-dim"
      >
        <span>
          Popular:{" "}
          <Link
            href="/jobs?q=Paralegal"
            className="text-accent-lavender hover:text-text transition-colors"
          >
            Paralegal
          </Link>
          {" · "}
          <Link
            href="/jobs?q=Data%20Analyst"
            className="text-accent-lavender hover:text-text transition-colors"
          >
            Data Analyst
          </Link>
          {" · "}
          <Link
            href="/jobs?q=Operations%20Lead"
            className="text-accent-lavender hover:text-text transition-colors"
          >
            Operations Lead
          </Link>
        </span>
        <span className="ml-auto tabular-nums">
          {roleCount.toLocaleString()} open roles
        </span>
      </div>
    </section>
  );
}
