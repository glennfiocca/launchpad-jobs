import Link from "next/link";
import { ArrowRight, Zap, BarChart3, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <div className="bg-black">
      {/* Hero */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Subtle radial glow behind hero text */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden"
        >
          <div className="mt-16 w-[600px] h-[400px] rounded-full bg-blue-500/10 blur-[120px]" />
        </div>

        <div className="relative text-center py-28">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-sm font-medium mb-8">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            One-click applications powered by AI
          </div>
          <h1 className="text-5xl sm:text-6xl font-semibold text-white leading-tight mb-6 tracking-tight">
            Apply to your dream job
            <br />
            <span className="text-zinc-400">in one click.</span>
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Fill your profile once. Apply everywhere instantly. AI tracks your applications
            and keeps you informed — no more spreadsheets.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/jobs"
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors text-base"
            >
              Browse Jobs
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/auth/signin"
              className="flex items-center gap-2 px-8 py-4 rounded-xl border border-white/10 text-white font-semibold hover:border-white/25 transition-colors text-base"
            >
              Create Profile
            </Link>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">
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
              className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-6 hover:border-white/15 transition-colors"
            >
              <div className={`w-9 h-9 ${feature.iconBg} rounded-lg flex items-center justify-center mb-4`}>
                {feature.icon}
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
