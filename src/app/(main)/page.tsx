import Link from "next/link";
import { ArrowRight, Zap, BarChart3, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildSankeyFromApplications,
  buildDemoSankeyData,
} from "@/lib/sankey";
import { PipelineSankey } from "@/components/sankey/pipeline-sankey";
import { JobSearchBlock } from "@/components/home/job-search-block";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  // Load real application data for signed-in users
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

  const mode = session?.user?.id ? "live" : "demo";

  return (
    <div className="h-full overflow-y-auto bg-black">
      {/* Hero */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Subtle radial glow behind hero text */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden"
        >
          <div className="mt-8 w-[500px] h-[250px] rounded-full bg-blue-500/10 blur-[120px]" />
        </div>

        <div className="relative text-center pt-8 pb-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-sm font-medium mb-4">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            One-click applications powered by AI
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight mb-4 tracking-tight">
            <span className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-transparent">
              Apply to your dream job
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              in one click.
            </span>
          </h1>
          <p className="text-base text-zinc-400 max-w-2xl mx-auto mb-6 leading-relaxed">
            Fill your profile once. Apply everywhere instantly. AI tracks your applications
            and keeps you informed — no more spreadsheets.
          </p>

          {/* Sankey visualization */}
          <div className="max-w-xl mx-auto mb-6 bg-[#0a0a0a] border border-white/8 rounded-xl p-3">
            <PipelineSankey mode={mode} data={sankeyData} />
          </div>

          {/* CTA for anonymous users */}
          {!session && (
            <div className="flex items-center justify-center mb-4">
              <Link
                href="/auth/signin"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors text-base"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Job Search */}
      <JobSearchBlock />

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              icon: <Zap className="w-5 h-5 text-blue-400" />,
              iconBg: "bg-blue-500/10",
              title: "One-Click Apply",
              desc: "Your profile auto-fills every application. What used to take 20 minutes takes 1 second.",
            },
            {
              icon: <BarChart3 className="w-5 h-5 text-green-400" />,
              iconBg: "bg-green-500/10",
              title: "Smart Tracking",
              desc: "AI reads your recruiting emails and automatically updates your application status.",
            },
            {
              icon: <MessageSquare className="w-5 h-5 text-purple-400" />,
              iconBg: "bg-purple-500/10",
              title: "In-App Messaging",
              desc: "All recruiter communications live in one place. Never lose track of a conversation.",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="bg-[#0a0a0a] border border-white/8 rounded-xl p-4 hover:border-white/15 transition-colors"
            >
              <div className={cn("relative w-8 h-8 rounded-lg flex items-center justify-center mb-2", feature.iconBg)}>
                <div className={cn("absolute inset-0 rounded-lg blur-md opacity-60", feature.iconBg)} />
                <div className="relative">{feature.icon}</div>
              </div>
              <h3 className="text-base font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
