"use client";

/**
 * Editorial-cockpit dashboard.
 *
 * Replaces the legacy two-pane split (list + detail) with a single-column
 * editorial document: hero (manifold + filter row), then a list of
 * inline-expandable application rows. A sticky compact strip pins below
 * the navbar once the user scrolls past the hero.
 *
 * See /tmp/pipeline-dashboard-handoff/design_handoff_dashboard_editorial_cockpit
 * for the design source of truth.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import type { ApplicationStatus } from "@prisma/client";

import type {
  ApplicationWithDashboardData,
  ApplicationWithJob,
} from "@/types";
import { PipelineSankey } from "@/components/sankey/pipeline-sankey";
import { buildSankeyFromApplications } from "@/lib/sankey";

import { CompactStrip } from "./cockpit/compact-strip";
import { Eyebrow } from "./cockpit/eyebrow";
import { LegendFilterRow } from "./cockpit/legend-filter-row";
import { AppRow } from "./cockpit/app-row";
import { EmailThreadModal } from "./cockpit/email-thread-modal";
import { Metric, Kbd } from "./cockpit/atoms";
import {
  FORWARD_STAGES,
  STAGE_TOKENS,
  stageLabel,
} from "./cockpit/stage-tokens";
import {
  deriveStageCounts,
  deriveHeroMetrics,
} from "./cockpit/derivations";

interface DashboardClientProps {
  initialApplications: ApplicationWithDashboardData[];
}

export function DashboardClient({
  initialApplications,
}: DashboardClientProps) {
  const searchParams = useSearchParams();
  // Initialize `openId` from the ?app=ID deep-link so the matching row is
  // expanded from the first render — no synchronous setState in an effect.
  const initialAppParam = searchParams.get("app");
  const [applications, setApplications] = useState<
    ApplicationWithDashboardData[]
  >(initialApplications);
  const [activeStage, setActiveStage] = useState<ApplicationStatus | null>(
    null,
  );
  const [hoverStage, setHoverStage] = useState<ApplicationStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialAppParam);
  // Modal state — a single instance lives at the DashboardClient level so
  // there's only ever one open thread at a time. `openThreadId` is null
  // when closed; non-null while open (and during the close transition).
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reduced = useReducedMotion();

  // ─── Derived data ────────────────────────────────────────────────────
  const sankeyData = useMemo(
    () =>
      buildSankeyFromApplications(
        applications.map((a) => ({
          status: a.status,
          statusHistory: a.statusHistory.map((h) => ({
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
          })),
          // `job.isActive` drives the "closed" bucket — see sankey.ts.
          job: { isActive: a.job.isActive },
        })),
      ),
    [applications],
  );

  const counts = useMemo(() => deriveStageCounts(applications), [
    applications,
  ]);

  const total = applications.length;

  // Filter: include any app whose history has ever touched the active stage
  // (or whose current status matches it). See README.md §Acceptance criteria.
  const filtered = useMemo(() => {
    if (!activeStage) return applications;
    return applications.filter(
      (a) =>
        a.status === activeStage ||
        a.statusHistory.some((h) => h.toStatus === activeStage),
    );
  }, [applications, activeStage]);

  const totalPendingQs = useMemo(
    () =>
      applications.reduce((sum, a) => sum + a.pendingQuestionsCount, 0),
    [applications],
  );

  const firstPendingAppId = useMemo(
    () =>
      applications.find((a) => a.pendingQuestionsCount > 0)?.id ?? null,
    [applications],
  );

  const metrics = useMemo(() => deriveHeroMetrics(applications), [
    applications,
  ]);

  const openThreadApp = useMemo(
    () =>
      openThreadId
        ? applications.find((a) => a.id === openThreadId) ?? null
        : null,
    [openThreadId, applications],
  );

  // ─── ?app=ID deep-link: scroll the matching row into view ──────────
  // `openId` is already initialized from the param on first render so the
  // row is expanded; this effect only synchronizes the scroll position
  // with that external DOM state once the refs have bound. No setState.
  useEffect(() => {
    const id = searchParams.get("app");
    if (!id) return;
    const row = rowRefs.current[id];
    if (!row) return;
    row.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  }, [searchParams, reduced]);

  function handleStageToggle(stage: ApplicationStatus): void {
    setActiveStage((prev) => (prev === stage ? null : stage));
  }

  function handleWithdrawn(updated: ApplicationWithJob): void {
    // The withdraw endpoint returns ApplicationWithJob (no derived count).
    // Re-attach the dashboard-data fields so the row's shape stays correct.
    setApplications((prev) =>
      prev.map((a) =>
        a.id === updated.id
          ? {
              ...updated,
              _count: a._count,
              pendingQuestionsCount: a.pendingQuestionsCount,
            }
          : a,
      ),
    );
  }

  return (
    <>
      <CompactStrip
        sankeyData={sankeyData}
        activeStage={activeStage}
        hoverStage={hoverStage}
        onStageHover={setHoverStage}
        onStageClick={handleStageToggle}
        counts={counts}
      />

      {/* ─── HERO ──────────────────────────────────────────────────────── */}
      <section className="max-w-[1320px] mx-auto px-8 pt-11 pb-6">
        <Eyebrow
          totalActive={total}
          totalPendingQuestions={totalPendingQs}
          pendingFirstAppId={firstPendingAppId}
        />

        {/* Editorial H1 — clamped responsive size, non-italic em in lavender */}
        <h1 className="font-display font-medium tracking-[-0.04em] leading-[0.98] text-text m-0 text-[clamp(44px,5.2vw,68px)]">
          Your pipeline.
          <br />
          <em className="not-italic text-accent-lavender">In motion.</em>
        </h1>

        {/* Subhead + metrics row */}
        <div className="mt-4 mb-7 flex items-baseline justify-between gap-6 flex-wrap">
          <p className="text-text-muted text-[15.5px] leading-[1.5] max-w-[560px] m-0">
            Every application you&rsquo;ve sent, every reply you&rsquo;ve gotten
            &mdash; laid out as a single flowing band. Click a stage to filter.
          </p>
          <div className="flex gap-6 font-mono text-[11px] text-text-dim">
            <Metric label="This week" value={String(metrics.thisWeek)} />
            <Metric
              label="Response rate"
              value={`${metrics.responseRate.toFixed(0)}%`}
            />
            <Metric
              label="Avg. reply"
              value={
                metrics.avgReplyDays === null
                  ? "—"
                  : `${metrics.avgReplyDays.toFixed(1)}d`
              }
            />
          </div>
        </div>

        {/* Manifold card */}
        <div className="bg-bg-chart border border-border rounded-[14px] overflow-hidden px-2 pt-2">
          <PipelineSankey
            mode="live"
            data={sankeyData}
            chartHeight={280}
            highlightStage={activeStage ?? hoverStage}
            onStageHover={setHoverStage}
            onStageClick={handleStageToggle}
            hideCaption
          />
        </div>

        {/* Legend / filter row */}
        <LegendFilterRow
          counts={counts}
          total={total}
          activeStage={activeStage}
          onStageClick={handleStageToggle}
          onStageHover={setHoverStage}
        />
      </section>

      {/* ─── LIST ──────────────────────────────────────────────────────── */}
      <section className="max-w-[1320px] mx-auto px-8 py-5">
        <SectionHeader
          activeStage={activeStage}
          count={filtered.length}
          total={total}
          onClear={() => setActiveStage(null)}
        />

        {filtered.length === 0 ? (
          <FilteredEmptyState
            stage={activeStage}
            onClear={() => setActiveStage(null)}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((app) => (
              <div
                key={app.id}
                ref={(el) => {
                  rowRefs.current[app.id] = el;
                }}
              >
                <AppRow
                  app={app}
                  open={openId === app.id}
                  onToggle={() =>
                    setOpenId((prev) => (prev === app.id ? null : app.id))
                  }
                  onWithdrawn={handleWithdrawn}
                  onOpenThread={(id) => setOpenThreadId(id)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ height: 60 }} />

      {openThreadApp && (
        <EmailThreadModal
          applicationId={openThreadApp.id}
          applicationStatus={openThreadApp.status}
          jobTitle={openThreadApp.job.title}
          companyName={openThreadApp.job.company.name}
          companyLogoUrl={openThreadApp.job.company.logoUrl ?? null}
          companyWebsite={openThreadApp.job.company.website ?? null}
          open={openThreadId !== null}
          onOpenChange={(o) => setOpenThreadId(o ? openThreadId : null)}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Sub-components — kept here because each is <30 lines and tightly coupled
// to the hero's shape. Promoted to siblings if any grows beyond that.
// ───────────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  activeStage: ApplicationStatus | null;
  count: number;
  total: number;
  onClear: () => void;
}

function SectionHeader({
  activeStage,
  count,
  total,
  onClear,
}: SectionHeaderProps) {
  return (
    <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
      <h2 className="m-0 font-display font-medium text-[26px] tracking-[-0.03em] text-text">
        {activeStage ? (
          <>
            Showing{" "}
            <em className="not-italic text-accent-lavender">
              {stageLabel(activeStage)}
            </em>
          </>
        ) : (
          <>
            All{" "}
            <em className="not-italic text-accent-lavender">applications</em>
          </>
        )}
      </h2>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-text-dim tabular-nums">
          {count} of {total}
        </span>
        {activeStage && (
          <button
            type="button"
            onClick={onClear}
            className="px-[10px] py-[5px] rounded-md bg-transparent border border-white/12 text-text-muted hover:text-text hover:border-white/20 text-[11px] font-mono cursor-pointer transition-colors"
          >
            clear filter ✕
          </button>
        )}
        {/* Decorative kbd chip — Phase 2 does not bind these keys. */}
        <div
          aria-hidden
          className="hidden md:inline-flex items-center gap-[6px] px-[9px] py-[4px] rounded-md border border-white/8 font-mono text-[10.5px] text-text-dim"
        >
          <Kbd>j</Kbd>
          <Kbd>k</Kbd> navigate
          <span className="text-white/10">·</span>
          <Kbd>↵</Kbd> open
        </div>
      </div>
    </div>
  );
}

interface FilteredEmptyStateProps {
  stage: ApplicationStatus | null;
  onClear: () => void;
}

function FilteredEmptyState({ stage, onClear }: FilteredEmptyStateProps) {
  // Stage is non-null in practice — the parent only renders this when there
  // are zero applications matching the active filter. Guarded for type safety.
  const label = stage ? STAGE_TOKENS[stage]?.label ?? stage : "this stage";
  return (
    <div className="p-8 rounded-[14px] bg-white/[0.02] border border-dashed border-white/8 text-center">
      <p className="text-text-muted text-[14px] mb-3">
        No applications in {label} yet. Most apps reach this stage 1–3 weeks
        after submission.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 px-3 py-[6px] rounded-md bg-transparent border border-white/12 text-text-muted hover:text-text hover:border-white/20 text-[11px] font-mono cursor-pointer transition-colors"
      >
        Clear filter ✕
      </button>
    </div>
  );
}

// Re-export FORWARD_STAGES for any consumer that needs the canonical list.
export { FORWARD_STAGES };
