import { Zap, BarChart3, MessageSquare } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildSankeyFromApplications,
  buildDemoSankeyData,
} from "@/lib/sankey";
import { PipelineSankey } from "@/components/sankey/pipeline-sankey";
import { HomeHero } from "@/components/home/home-hero";

export const dynamic = "force-dynamic";

// Editorial palette — used for the stats-legend swatches so the legend tracks
// the manifold colors regardless of the canonical STAGE_COLORS in sankey.ts.
// Keyed by SankeyNode.id (the ApplicationStatus enum value).
const EDITORIAL_STAGE_COLORS: Record<string, string> = {
  APPLIED: "#6366f1",
  REVIEWING: "#8b5cf6",
  PHONE_SCREEN: "#a855f7",
  INTERVIEWING: "#d946ef",
  OFFER: "#22d3ee",
};

// The five forward-progress stages shown in the stats legend. Order matters —
// matches the manifold left-to-right.
const LEGEND_STAGE_IDS = [
  "APPLIED",
  "REVIEWING",
  "PHONE_SCREEN",
  "INTERVIEWING",
  "OFFER",
] as const;

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // Load real application data for signed-in users; demo for everyone else.
  // The pipeline visualization is shown in both modes — signed-out users see
  // a "Sample" pill above the heading so the demo intent is clear.
  const sankeyData = session?.user?.id
    ? buildSankeyFromApplications(
        await db.application.findMany({
          where: { userId: session.user.id },
          select: {
            status: true,
            statusHistory: {
              select: { fromStatus: true, toStatus: true },
            },
          },
        }),
      )
    : buildDemoSankeyData();

  const mode: "live" | "demo" = session?.user?.id ? "live" : "demo";

  // Active job count for the hero's "open roles" meta. Uses the same predicate
  // as /jobs listing + sitemap (Job.isActive=true) so the number is consistent.
  const roleCount = await db.job.count({ where: { isActive: true } });

  // Stats-legend cells: pull the five forward stages from the sankey nodes,
  // skip any that are missing (live data may not yet have all stages).
  const nodesById = new Map(sankeyData.nodes.map((n) => [n.id, n]));
  const legendStages = LEGEND_STAGE_IDS.flatMap((id) => {
    const n = nodesById.get(id);
    return n ? [n] : [];
  });

  const totalApplications = sankeyData.totalApplications;

  return (
    <main className="min-h-full bg-bg">
      <div className="max-w-[1180px] mx-auto px-6 pt-8 pb-16">
        <HomeHero roleCount={roleCount} />

        {/* ─── Pipeline section ─────────────────────────────────────── */}
        <section className="mt-16">
          {mode === "demo" && (
            <div className="mb-2.5">
              <span
                className="inline-block font-mono text-[10.5px] uppercase tracking-[0.06em] text-accent-lavender"
                style={{
                  background: "rgba(196,181,253,0.12)",
                  padding: "3px 8px",
                  borderRadius: "999px",
                }}
              >
                Sample
              </span>
            </div>
          )}

          <div className="flex justify-between items-baseline mb-3.5">
            <h3
              className="m-0 font-display font-semibold text-text leading-none inline-flex items-baseline gap-[0.18em]"
              style={{
                fontSize: "30px",
                letterSpacing: "-0.04em",
                fontVariationSettings: "'opsz' 72, 'wdth' 100",
              }}
            >
              Your{" "}
              <em className="not-italic font-medium text-accent-lavender">
                pipeline
              </em>
            </h3>
            <span className="font-mono text-[11px] text-text-dim tabular-nums">
              {totalApplications.toLocaleString()} application
              {totalApplications === 1 ? "" : "s"} · updated 2s ago
            </span>
          </div>

          {/* Chart card */}
          <div className="bg-bg-chart border border-border rounded-[14px] overflow-hidden">
            <PipelineSankey data={sankeyData} mode={mode} />
          </div>

          {/* Stats legend — 5-cell grid */}
          <div
            className="mt-3.5 grid grid-cols-2 md:grid-cols-5 gap-px border border-border rounded-[12px] overflow-hidden"
            style={{ background: "rgba(245,244,241,0.08)" }}
          >
            {legendStages.map((s) => {
              const pct =
                totalApplications > 0 ? (s.count / totalApplications) * 100 : 0;
              const swatch = EDITORIAL_STAGE_COLORS[s.id] ?? s.color;
              return (
                <div
                  key={s.id}
                  className="relative bg-bg px-4 py-3.5"
                >
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 right-4 block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: swatch,
                      boxShadow: `0 0 6px ${swatch}`,
                    }}
                  />
                  <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-text-dim">
                    {s.label}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5 font-display font-medium text-text tabular-nums tracking-[-0.02em] text-[22px] leading-tight">
                    {s.count.toLocaleString()}
                    <span className="font-mono text-[11px] text-text-dim font-normal">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Feature cards ────────────────────────────────────────── */}
        <section className="mt-9 grid grid-cols-1 lg:grid-cols-3 gap-3">
          {FEATURE_CARDS.map((f) => (
            <article
              key={f.title}
              className="bg-bg border border-border rounded-[12px] px-[22px] py-5 transition-colors duration-200 hover:border-border-strong"
            >
              <div
                className="inline-flex items-center justify-center w-8 h-8 rounded-[9px]"
                style={{ background: f.iconBg, color: f.iconFg }}
              >
                <f.Icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <h3
                className="mt-3.5 mb-1 text-[18px] font-medium tracking-[-0.02em] text-text font-display"
              >
                {f.titlePrefix}{" "}
                <em className="not-italic font-medium text-accent-lavender">
                  {f.titleAccent}
                </em>
              </h3>
              <p className="m-0 text-text-muted text-[13.5px] leading-[1.55]">
                {f.body}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

// Static feature-card config — externalized so the JSX stays a flat map.
const FEATURE_CARDS: ReadonlyArray<{
  Icon: typeof Zap;
  iconBg: string;
  iconFg: string;
  titlePrefix: string;
  titleAccent: string;
  title: string;
  body: string;
}> = [
  {
    Icon: Zap,
    iconBg: "rgba(129,140,248,0.14)",
    iconFg: "#a5b4fc",
    titlePrefix: "One-Click",
    titleAccent: "Apply",
    title: "One-Click Apply",
    body:
      "Your profile auto-fills every application. What used to take 20 minutes takes 20 seconds.",
  },
  {
    Icon: BarChart3,
    iconBg: "rgba(34,197,94,0.14)",
    iconFg: "#86efac",
    titlePrefix: "Smart",
    titleAccent: "Tracking",
    title: "Smart Tracking",
    body:
      "Status updates itself as recruiters reply. No spreadsheets, no copy-paste.",
  },
  {
    Icon: MessageSquare,
    iconBg: "rgba(168,85,247,0.14)",
    iconFg: "#d8b4fe",
    titlePrefix: "In-App",
    titleAccent: "Messaging",
    title: "In-App Messaging",
    body:
      "Every recruiter conversation in one place. Never lose track of a thread.",
  },
];
